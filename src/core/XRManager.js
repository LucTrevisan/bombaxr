/**
 * XRManager v10 — WebXR robusto para Meta Quest
 *
 * v10: input XR isolado do desktop, grab via motionController com
 *      suspensao de fisica, snap com SNAP_DIST_XR, toast em GUI 3D
 */
import * as BABYLON from '@babylonjs/core'
import * as GUI     from '@babylonjs/gui'
import { SNAP_DIST_XR } from '../utils/constants.js'

const PINCH_ON    = 0.028
const PINCH_OFF   = 0.058
const NEAR_RADIUS = 0.25
const RAY_LENGTH  = 20

export class XRManager {
  constructor(scene, interaction, assembly, pumpModel) {
    this.scene       = scene
    this.interaction = interaction
    this.assembly    = assembly
    this.pumpModel   = pumpModel
    this.xrHelper    = null
    this.vrUI        = null
    this.anim        = null   // AnimationController — setado por main.js
    this.inXR        = false

    // ── Grab state (compartilhado entre hand tracking e controllers) ──
    this._grabState = {
      key:       null,
      posOffset: null,
      savedPhysics: null,
      source:    null,   // 'hand' | 'controller'
      ctrl:      null,   // referência ao controller ativo
    }

    // ── Hand tracking state ───────────────────────────────────────────
    this._pinchL    = false
    this._pinchR    = false
    this._pinchPosL = null
    this._pinchPosR = null
    this._nearKey   = { left: null, right: null }

    // ── Two-hand manipulation ─────────────────────────────────────────
    this._objManip = {
      active: false, initDist: null, initScale: null,
      initMidpoint: null, initRotY: null, initAngle: null,
    }

    // ── VR toast (GUI 3D) ─────────────────────────────────────────────
    this._toastPlane = null
    this._toastText  = null
    this._toastTimer = null
  }

  // ══════════════════════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════════════════════
  async init() {
    const vrSupported = await BABYLON.WebXRSessionManager
      .IsSessionSupportedAsync('immersive-vr').catch(() => false)

    if (!vrSupported) {
      console.warn('WebXR nao suportado — modo desktop ativo')
      this._showDesktopWarning()
      return
    }

    try {
      this.xrHelper = await this.scene.createDefaultXRExperienceAsync({
        floorMeshes:      [],
        optionalFeatures: true,
        uiOptions: {
          sessionMode:        'immersive-vr',
          referenceSpaceType: 'local-floor',
        },
        inputOptions: { doNotLoadControllerMeshes: false },
      })

      this.xrHelper.baseExperience.camera.position =
        new BABYLON.Vector3(0, 1.6, -1.5)

      this._buildVRToast()
      this._setupFeatures()
      this._setupHandTracking()
      this._setupControllers()
      this._bindStateChanges()

      console.log('XRManager v10 inicializado')
    } catch (e) {
      console.error('Erro WebXR:', e)
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // FEATURES
  // ══════════════════════════════════════════════════════════════════════
  _setupFeatures() {
    const fm = this.xrHelper.baseExperience.featuresManager

    try {
      fm.enableFeature(BABYLON.WebXRFeatureName.POINTER_SELECTION, 'stable', {
        xrInput: this.xrHelper.input,
        enablePointerSelectionOnAllControllers: true,
        disablePointerLighting: false,
      })
    } catch (e) { console.warn('Pointer selection:', e.message) }

    try {
      fm.enableFeature(BABYLON.WebXRFeatureName.HAND_TRACKING, 'latest', {
        xrInput:     this.xrHelper.input,
        jointMeshes: { enablePhysics: false, invisible: false },
      })
      console.log('Hand tracking ativado')
    } catch (e) { console.log('Hand tracking indisponivel:', e.message) }

    try {
      fm.enableFeature(BABYLON.WebXRFeatureName.NEAR_INTERACTION, 'latest', {
        xrInput: this.xrHelper.input,
      })
    } catch (e) { /* opcional */ }
  }

  // ══════════════════════════════════════════════════════════════════════
  // STATE — entrada/saida do VR + controle do input desktop
  // ══════════════════════════════════════════════════════════════════════
  _bindStateChanges() {
    this.xrHelper.baseExperience.onStateChangedObservable.add(state => {
      if (state === BABYLON.WebXRState.IN_XR) {
        this.inXR = true
        this.interaction.disableDesktopInput()
        document.body.classList.add('in-vr')
        this.vrUI?.onEnterVR(this.xrHelper.baseExperience.camera)
        console.log('Entrou no VR')
      } else if (state === BABYLON.WebXRState.NOT_IN_XR) {
        this.inXR = false
        this.interaction.enableDesktopInput()
        this._releaseGrab()
        document.body.classList.remove('in-vr')
        this.vrUI?.onExitVR()
      }
    })
  }

  // ══════════════════════════════════════════════════════════════════════
  // HAND TRACKING
  // ══════════════════════════════════════════════════════════════════════
  _setupHandTracking() {
    const handData = {}

    this.xrHelper.input.onControllerAddedObservable.add(ctrl => {
      if (!ctrl.inputSource?.hand) return
      const hand = ctrl.inputSource.handedness

      handData[hand] = { ctrl, pinchActive: false, frames: 0 }
      this._nearKey[hand] = null

      const obs = this.scene.onBeforeRenderObservable.add(() => {
        if (!this.inXR) return
        const joints = ctrl.inputSource?.hand
        if (!joints) return

        const thumb = joints.get('thumb-tip')
        const index = joints.get('index-finger-tip')
        if (!thumb || !index) return

        const tp = this._jPos(thumb)
        const ip = this._jPos(index)
        if (!tp || !ip) return

        const dist   = BABYLON.Vector3.Distance(tp, ip)
        const center = BABYLON.Vector3.Lerp(tp, ip, 0.5)
        const hd     = handData[hand]
        if (!hd) return

        this._nearHighlight(center, NEAR_RADIUS, hand)

        if (!hd.pinchActive && dist < PINCH_ON) {
          if (++hd.frames >= 2) {
            hd.pinchActive = true
            hd.frames      = 0
            if (hand === 'left')  { this._pinchL = true;  this._pinchPosL = center.clone() }
            if (hand === 'right') { this._pinchR = true;  this._pinchPosR = center.clone() }
            this._onPinchStart(hand, center)
          }
        }

        if (hd.pinchActive && dist > PINCH_OFF) {
          hd.pinchActive = false; hd.frames = 0
          if (hand === 'left')  { this._pinchL = false; this._pinchPosL = null }
          if (hand === 'right') { this._pinchR = false; this._pinchPosR = null }
          this._onPinchEnd(hand)
          this._objManip.active = false
        }

        if (hd.pinchActive) {
          if (hand === 'left')  this._pinchPosL = center.clone()
          if (hand === 'right') this._pinchPosR = center.clone()
        }

        // Drag contínuo com mão direita
        if (hd.pinchActive && hand === 'right' && this._grabState.key && this._grabState.source === 'hand') {
          this._updateGrabPosition(center)
        }

        if (this._pinchL && this._pinchR && this._pinchPosL && this._pinchPosR) {
          this._updateObjManip(this._pinchPosL, this._pinchPosR)
        }
      })

      ctrl.onDisposeObservable?.add(() => {
        this.scene.onBeforeRenderObservable.remove(obs)
        delete handData[hand]
        this._nearKey[hand] = null
        if (hand === 'left')  { this._pinchL = false; this._pinchPosL = null }
        if (hand === 'right') { this._pinchR = false; this._pinchPosR = null }
      })
    })
  }

  _onPinchStart(hand, center) {
    if (this._pinchL && this._pinchR && this._pinchPosL && this._pinchPosR) {
      this._startObjManip(this._pinchPosL, this._pinchPosR)
      return
    }

    if (hand === 'left') {
      setTimeout(() => {
        if (!this._pinchR) {
          if (this.assembly.isExploded) {
            this.assembly.montar(true); this._toast('Montando...')
          } else {
            this.assembly.explodir(true); this._toast('Explodindo...')
          }
        }
      }, 150)
    }

    if (hand === 'right') {
      const hit = this._nearestMesh(center, NEAR_RADIUS)
      if (hit?.metadata?.partKey) {
        this._startGrab(hit.metadata.partKey, center, 'hand')
      }
    }
  }

  _onPinchEnd(hand) {
    this._objManip.active = false
    if (hand === 'right' && this._grabState.source === 'hand') {
      this._endGrab()
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // CONTROLLERS FISICOS — via motionController API
  // ══════════════════════════════════════════════════════════════════════
  _setupControllers() {
    this.xrHelper.input.onControllerAddedObservable.add(ctrl => {
      if (ctrl.inputSource?.hand) return   // mão — não controller

      ctrl.onMotionControllerInitObservable.add(mc => {
        const hand = mc.handedness

        // ── TRIGGER → pegar peca ──────────────────────────────────────
        const trigger = mc.getComponent('xr-standard-trigger')
        if (trigger) {
          let triggerDown = false

          trigger.onButtonStateChangedObservable.add(comp => {
            if (comp.pressed && !triggerDown) {
              triggerDown = true
              this._controllerPick(ctrl)
            } else if (!comp.pressed && triggerDown) {
              triggerDown = false
              if (this._grabState.source === 'controller' && this._grabState.ctrl === ctrl) {
                this._endGrab(ctrl)
              }
            }
          })

          // Drag loop — roda a cada frame enquanto o controller existir
          const dragObs = this.scene.onBeforeRenderObservable.add(() => {
            if (this._grabState.source !== 'controller') return
            if (this._grabState.ctrl !== ctrl) return
            const ctrlPos = this._getCtrlPos(ctrl)
            if (ctrlPos) this._updateGrabPosition(ctrlPos)
          })
          ctrl.onDisposeObservable?.add(() => {
            this.scene.onBeforeRenderObservable.remove(dragObs)
          })
        }

        // ── GRIP → mover bomba inteira ────────────────────────────────
        const grip = mc.getComponent('xr-standard-squeeze')
        if (grip) {
          let grabOffset = null

          grip.onButtonStateChangedObservable.add(comp => {
            const root    = this.pumpModel?.rootNode
            const ctrlPos = this._getCtrlPos(ctrl)
            if (comp.pressed && root && ctrlPos) {
              grabOffset = ctrlPos.subtract(root.position)
              this._hapticPulse(ctrl, 0.3, 60)
            } else {
              grabOffset = null
            }
          })

          const gripObs = this.scene.onBeforeRenderObservable.add(() => {
            if (!grabOffset) return
            const root    = this.pumpModel?.rootNode
            const ctrlPos = this._getCtrlPos(ctrl)
            if (root && ctrlPos) root.position = ctrlPos.subtract(grabOffset)
          })
          ctrl.onDisposeObservable?.add(() => {
            this.scene.onBeforeRenderObservable.remove(gripObs)
          })
        }

        // ── A / X → explodir / montar ─────────────────────────────────
        const btnAX = mc.getComponent('a-button') || mc.getComponent('x-button')
        if (btnAX) {
          btnAX.onButtonStateChangedObservable.add(comp => {
            if (!comp.pressed) return
            if (this.assembly.isExploded) {
              this.assembly.montar(true); this._toast('Montando...')
            } else {
              this.assembly.explodir(true); this._toast('Explodindo...')
            }
            this._hapticPulse(ctrl, 0.3, 60)
          })
        }

        // ── B / Y → cinematica ou proximo passo ──────────────────────
        const btnBY = mc.getComponent('b-button') || mc.getComponent('y-button')
        if (btnBY) {
          btnBY.onButtonStateChangedObservable.add(comp => {
            if (!comp.pressed) return
            if (this.assembly.modo === 'guiado') {
              this.assembly.guidedAdvance()
              this._toast('Proximo passo')
            } else if (this.anim && !this.anim.isPlaying) {
              this._toast('Cinematica...')
              this.anim.playDisassembly((key, i, total) => {
                this._toast(`${i+1}/${total}`)
              })
            }
            this._hapticPulse(ctrl, 0.3, 60)
          })
        }

        // ── Thumbstick direito → rotacionar bomba ─────────────────────
        const stickR = mc.getComponent('xr-standard-thumbstick')
        if (stickR && hand === 'right') {
          stickR.onAxisValueChangedObservable.add(axes => {
            const root = this.pumpModel?.rootNode
            if (root && Math.abs(axes.x) > 0.2) root.rotation.y += axes.x * 0.03
          })
        }

        // ── Thumbstick esquerdo → menu + escala ──────────────────────
        const stickL = mc.getComponent('xr-standard-thumbstick')
        if (stickL && hand === 'left') {
          stickL.onButtonStateChangedObservable.add(comp => {
            if (!comp.pressed) return
            const main = this.vrUI?._panels?.mainPlane
            if (main) main.setEnabled(!main.isEnabled())
            this._toast('Menu')
          })
          stickL.onAxisValueChangedObservable.add(axes => {
            const root = this.pumpModel?.rootNode
            if (root && Math.abs(axes.y) > 0.3) {
              const ns = Math.max(0.5, Math.min(6.0, root.scaling.x + (-axes.y * 0.01)))
              root.scaling.setAll(ns)
            }
          })
        }
      })
    })
  }

  // ══════════════════════════════════════════════════════════════════════
  // GRAB UNIFICADO — usado por hand tracking e controllers
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Inicia o grab de uma peca.
   * @param {string}          key    - chave da peca
   * @param {BABYLON.Vector3} refPos - posicao de referencia (pinch center ou ctrl pos)
   * @param {'hand'|'controller'} source
   * @param {object}          [ctrl] - controller XR (só para source='controller')
   */
  _startGrab(key, refPos, source, ctrl = null) {
    const meta = this.pumpModel?.meta?.[key]
    if (meta?.interactive === false) return

    const node = this.pumpModel?.parts?.[key]
    if (!node) return

    // Suspender fisica (se houver) antes de mover
    const savedPhysics = this._suspendPhysics(node)

    const posOffset = refPos.subtract(node.getAbsolutePosition())

    this._grabState = { key, posOffset, savedPhysics, source, ctrl }

    this.interaction.select(key)
    this.vrUI?.showPartInfoVR(key)
    this._hapticPulse(ctrl, 0.4, 80)
    this._toast(meta?.label || key)
  }

  /** Atualiza posicao da peca durante drag */
  _updateGrabPosition(refPos) {
    const node = this.pumpModel?.parts?.[this._grabState.key]
    if (!node || !this._grabState.posOffset) return

    const targetWorld = refPos.subtract(this._grabState.posOffset)
    node.position = this._worldToLocal(targetWorld, node)
    this.interaction?._updateSnapRing?.(this._grabState.key)
  }

  /** Finaliza o grab — tenta snap e restaura fisica */
  _endGrab(ctrl = null) {
    if (!this._grabState.key) return

    const node = this.pumpModel?.parts?.[this._grabState.key]

    // Tentar snap com threshold XR (maior que desktop)
    const snapped = this.assembly.trySnap(this._grabState.key, SNAP_DIST_XR)
    if (snapped) {
      this._toast('Encaixado!')
      this._hapticPulse(ctrl || this._grabState.ctrl, 0.8, 150)
    }

    // Restaurar fisica
    if (node) this._restorePhysics(node, this._grabState.savedPhysics)

    this.interaction.deselect()
    this._grabState = { key: null, posOffset: null, savedPhysics: null, source: null, ctrl: null }
  }

  /** Libera grab sem snap (ex: ao sair do VR) */
  _releaseGrab() {
    if (!this._grabState.key) return
    const node = this.pumpModel?.parts?.[this._grabState.key]
    if (node) this._restorePhysics(node, this._grabState.savedPhysics)
    this.interaction.deselect()
    this._grabState = { key: null, posOffset: null, savedPhysics: null, source: null, ctrl: null }
  }

  /** Raycast do controller e inicia grab se acertar peca */
  _controllerPick(ctrl) {
    const ray = new BABYLON.Ray(BABYLON.Vector3.Zero(), BABYLON.Vector3.Forward(), RAY_LENGTH)
    ctrl.getWorldPointerRayToRef(ray)
    const pick = this.scene.pickWithRay(ray,
      m => m.isPickable && m.metadata?.partKey && m.isEnabled()
    )

    if (pick?.hit && pick.pickedMesh?.metadata?.partKey) {
      const ctrlPos = this._getCtrlPos(ctrl)
      if (ctrlPos) {
        this._startGrab(pick.pickedMesh.metadata.partKey, ctrlPos, 'controller', ctrl)
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // SUSPENSAO DE FISICA — hooks para Havok / Ammo / impostors
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Suspende corpo fisico do node durante grab.
   * Compativel com PhysicsBody (Havok v2) e PhysicsImpostor (v1).
   * Retorna estado salvo para restauração, ou null se sem fisica.
   */
  _suspendPhysics(node) {
    // Havok v2 (PhysicsBody)
    const body = node.physicsBody
    if (body) {
      const motionType = body.getMotionType?.()
      body.setMotionType?.(BABYLON.PhysicsMotionType.ANIMATED)
      body.disablePreStep = false
      return { type: 'v2', body, motionType }
    }

    // Legacy v1 (PhysicsImpostor)
    const imp = node.physicsImpostor
    if (imp) {
      const mass = imp.mass
      imp.setMass(0)
      return { type: 'v1', imp, mass }
    }

    return null
  }

  /** Restaura corpo fisico ao soltar a peca */
  _restorePhysics(node, saved) {
    if (!saved) return

    if (saved.type === 'v2' && saved.body) {
      saved.body.setMotionType?.(saved.motionType)
      saved.body.disablePreStep = true
    }

    if (saved.type === 'v1' && saved.imp) {
      saved.imp.setMass(saved.mass)
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // MANIPULACAO COM DOIS PONTOS (rotate + scale)
  // ══════════════════════════════════════════════════════════════════════
  _startObjManip(posL, posR) {
    const root = this.pumpModel?.rootNode
    if (!root) return
    const dist  = BABYLON.Vector3.Distance(posL, posR)
    const angle = Math.atan2(posR.z - posL.z, posR.x - posL.x)
    this._objManip = {
      active:      true,
      initDist:    dist,
      initScale:   root.scaling.x,
      initMidpoint: BABYLON.Vector3.Lerp(posL, posR, 0.5).clone(),
      initRotY:    root.rotation.y,
      initAngle:   angle,
    }
  }

  _updateObjManip(posL, posR) {
    if (!this._objManip.active) { this._startObjManip(posL, posR); return }
    const root = this.pumpModel?.rootNode
    if (!root) return
    const m = this._objManip

    const currDist   = BABYLON.Vector3.Distance(posL, posR)
    const newScale   = Math.max(0.5, Math.min(6.0, m.initScale * (currDist / m.initDist)))
    root.scaling.setAll(newScale)

    const currAngle  = Math.atan2(posR.z - posL.z, posR.x - posL.x)
    root.rotation.y  = m.initRotY + (currAngle - m.initAngle)
  }

  // ══════════════════════════════════════════════════════════════════════
  // NEAR HIGHLIGHT
  // ══════════════════════════════════════════════════════════════════════
  _nearHighlight(pos, radius, hand) {
    if (this._grabState.key) return

    let nearKey  = null
    let nearDist = radius

    for (const m of this.scene.meshes) {
      if (!m.isPickable || !m.metadata?.partKey || !m.isEnabled()) continue
      const d = BABYLON.Vector3.Distance(pos, m.getAbsolutePosition())
      if (d < nearDist) { nearKey = m.metadata.partKey; nearDist = d }
    }

    if (nearKey !== this._nearKey[hand]) {
      const old = this._nearKey[hand]
      this._nearKey[hand] = nearKey
      if (old) this.interaction?.dehighlight?.(old)
      if (nearKey) this.interaction?.highlight?.(nearKey)
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // VR TOAST — Babylon GUI 3D (sem DOM)
  // ══════════════════════════════════════════════════════════════════════
  _buildVRToast() {
    const plane = BABYLON.MeshBuilder.CreatePlane('vr_toast',
      { width: 0.45, height: 0.08 }, this.scene)
    plane.isPickable = false
    plane.renderingGroupId = 1
    plane.setEnabled(false)

    const tex = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 450, 80)

    const bg = new GUI.Rectangle()
    bg.background   = 'rgba(8,12,20,0.88)'
    bg.cornerRadius = 16
    bg.thickness    = 1
    bg.color        = 'rgba(0,200,240,0.35)'
    bg.width = '100%'; bg.height = '100%'
    tex.addControl(bg)

    const txt = new GUI.TextBlock()
    txt.color    = '#d0dce8'
    txt.fontSize = 24
    txt.fontWeight = 'bold'
    bg.addControl(txt)

    this._toastPlane = plane
    this._toastText  = txt
  }

  _toast(msg) {
    // Em modo desktop, usar toast DOM como fallback
    if (!this.inXR || !this._toastPlane) {
      const el = document.getElementById('toast')
      if (el) {
        el.textContent = msg
        el.className   = 'toast toast-info visible'
        clearTimeout(this._toastTimer)
        this._toastTimer = setTimeout(() => el.classList.remove('visible'), 2000)
      }
      return
    }

    // Em VR — toast 3D posicionado em frente à câmera
    this._toastText.text = msg
    this._toastPlane.setEnabled(true)

    const cam = this.xrHelper?.baseExperience?.camera || this.scene.activeCamera
    if (cam) {
      const fwd = cam.getForwardRay(1).direction
      this._toastPlane.position = cam.position.add(fwd.scale(0.9))
        .addInPlaceFromFloats(0, -0.25, 0)

      // Look-at manual (evita billboardMode que interfere com picking)
      const dx = cam.position.x - this._toastPlane.position.x
      const dz = cam.position.z - this._toastPlane.position.z
      this._toastPlane.rotation.y = Math.atan2(dx, dz)
    }

    clearTimeout(this._toastTimer)
    this._toastTimer = setTimeout(() => this._toastPlane?.setEnabled(false), 2200)
  }

  // ══════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════
  _getCtrlPos(ctrl) {
    if (!ctrl) return null
    return ctrl.grip?.getAbsolutePosition?.()
      || ctrl.pointer?.getAbsolutePosition?.()
      || ctrl.rootMesh?.getAbsolutePosition?.()
      || null
  }

  _worldToLocal(worldPos, node) {
    if (!node.parent) return worldPos.clone()
    const invParent = BABYLON.Matrix.Invert(node.parent.getWorldMatrix())
    return BABYLON.Vector3.TransformCoordinates(worldPos, invParent)
  }

  _hapticPulse(ctrl, intensity, durationMs) {
    try {
      const gamepad = ctrl?.inputSource?.gamepad
      const actuator = gamepad?.hapticActuators?.[0]
        || gamepad?.vibrationActuator
      actuator?.pulse?.(intensity, durationMs)
    } catch {}
  }

  _jPos(joint) {
    try {
      const sm    = this.xrHelper.baseExperience.sessionManager
      const frame = sm.currentFrame
      const pose  = frame?.getJointPose?.(joint, sm.referenceSpace)
      if (!pose) return null
      const p = pose.transform.position
      return new BABYLON.Vector3(p.x, p.y, p.z)
    } catch { return null }
  }

  _nearestMesh(pos, radius) {
    let best = null, bestDist = radius
    for (const m of this.scene.meshes) {
      if (!m.isPickable || !m.metadata?.partKey || !m.isEnabled()) continue
      const d = BABYLON.Vector3.Distance(pos, m.getAbsolutePosition())
      if (d < bestDist) { best = m; bestDist = d }
    }
    return best
  }

  _showDesktopWarning() {
    const el = document.getElementById('xr-status')
    if (el) {
      el.textContent = 'WebXR nao disponivel — modo desktop ativo. Use o Meta Browser no Quest.'
      el.style.display = 'block'
    }
  }
}
