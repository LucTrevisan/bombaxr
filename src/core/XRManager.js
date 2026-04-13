/**
 * XRManager v9 — WebXR robusto para Meta Quest
 *
 * v9: hierarquia normalizada, haptics, cinemática VR,
 *     fallbacks de posição do controller, pick tolerante
 */
import * as BABYLON from '@babylonjs/core'

const PINCH_ON  = 0.028
const PINCH_OFF = 0.058
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

    this._grabState = { key: null, offset: null }

    this._pinchL = false
    this._pinchR = false
    this._pinchPosL = null
    this._pinchPosR = null

    this._nearKey = { left: null, right: null }

    this._objManip = {
      active: false, initDist: null, initScale: null,
      initMidpoint: null, initRotY: null, initAngle: null,
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════════════════════
  async init() {
    const vrSupported = await BABYLON.WebXRSessionManager
      .IsSessionSupportedAsync('immersive-vr').catch(() => false)

    if (!vrSupported) {
      console.warn('⚠️ WebXR não suportado — modo desktop ativo')
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

      this._setupFeatures()
      this._setupHandTracking()
      this._setupControllers()
      this._bindStateChanges()

      console.log('✅ XRManager v9 inicializado')
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
      console.log('✅ Hand tracking ativado')
    } catch (e) { console.log('Hand tracking indisponível:', e.message) }

    try {
      fm.enableFeature(BABYLON.WebXRFeatureName.NEAR_INTERACTION, 'latest', {
        xrInput: this.xrHelper.input,
      })
    } catch (e) { /* opcional */ }
  }

  // ══════════════════════════════════════════════════════════════════════
  // STATE
  // ══════════════════════════════════════════════════════════════════════
  _bindStateChanges() {
    this.xrHelper.baseExperience.onStateChangedObservable.add(state => {
      if (state === BABYLON.WebXRState.IN_XR) {
        this.inXR = true
        document.body.classList.add('in-vr')
        this.vrUI?.onEnterVR(this.xrHelper.baseExperience.camera)
        console.log('✅ Entrou no VR')
      } else if (state === BABYLON.WebXRState.NOT_IN_XR) {
        this.inXR = false
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

        if (hd.pinchActive && hand === 'right' && this._grabState.key) {
          const node = this.pumpModel?.parts?.[this._grabState.key]
          if (node && this._grabState.offset) {
            const targetWorld = center.subtract(this._grabState.offset)
            node.position = this._worldToLocal(targetWorld, node)
            this.interaction?._updateSnapRing?.(this._grabState.key)
          }
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
            this.assembly.montar(true); this._toast('🔩 Montando...')
          } else {
            this.assembly.explodir(true); this._toast('💥 Explodindo...')
          }
        }
      }, 150)
    }

    if (hand === 'right') {
      const hit = this._nearestMesh(center, NEAR_RADIUS)
      if (hit?.metadata?.partKey) {
        const key  = hit.metadata.partKey
        const meta = this.pumpModel?.meta?.[key]
        if (meta?.interactive === false) return
        const node = this.pumpModel?.parts?.[key]
        if (node) {
          this._grabState = { key, offset: center.subtract(node.getAbsolutePosition()) }
          this.interaction.select(key)
          this.vrUI?.showPartInfoVR(key)
          this._toast('✋ ' + (meta?.label || key))
        }
      }
    }
  }

  _onPinchEnd(hand) {
    this._objManip.active = false

    if (hand === 'right' && this._grabState.key) {
      const snapped = this.assembly.trySnap(this._grabState.key)
      if (snapped) this._toast('✅ Encaixado!')
      this.interaction.deselect()
      this._grabState = { key: null, offset: null }
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // CONTROLLERS FÍSICOS
  // ══════════════════════════════════════════════════════════════════════
  _setupControllers() {
    const ctrlState = {}

    this.xrHelper.input.onControllerAddedObservable.add(ctrl => {
      if (ctrl.inputSource?.hand) return

      ctrl.onMotionControllerInitObservable.add(mc => {
        const hand = mc.handedness
        ctrlState[hand] = { ctrl, mc, grabKey: null, grabOffset: null, triggerDown: false }

        // ── TRIGGER → pegar peça ──────────────────────────────────────
        const trigger = mc.getComponent('xr-standard-trigger')
        if (trigger) {
          trigger.onButtonStateChangedObservable.add(comp => {
            const cs = ctrlState[hand]
            if (comp.pressed && !cs.triggerDown) {
              cs.triggerDown = true

              const ray = new BABYLON.Ray(BABYLON.Vector3.Zero(), BABYLON.Vector3.Forward(), RAY_LENGTH)
              ctrl.getWorldPointerRayToRef(ray)
              const pick = this.scene.pickWithRay(ray,
                m => m.isPickable && m.metadata?.partKey && m.isEnabled()
              )

              if (pick?.hit && pick.pickedMesh?.metadata?.partKey) {
                const key  = pick.pickedMesh.metadata.partKey
                const meta = this.pumpModel?.meta?.[key]
                if (meta?.interactive === false) return
                cs.grabKey    = key
                const node    = this.pumpModel?.parts?.[cs.grabKey]
                const ctrlPos = this._getCtrlPos(ctrl)
                if (node && ctrlPos) {
                  cs.grabOffset = ctrlPos.subtract(node.getAbsolutePosition())
                  this._hapticPulse(ctrl, 0.4, 80)
                }
                this.interaction.select(cs.grabKey)
                this.vrUI?.showPartInfoVR(cs.grabKey)
                this._toast('✋ ' + (meta?.label || key))
              }
            } else if (!comp.pressed && cs.triggerDown) {
              cs.triggerDown = false
              if (cs.grabKey) {
                const snapped = this.assembly.trySnap(cs.grabKey)
                if (snapped) {
                  this._toast('✅ Encaixado!')
                  this._hapticPulse(ctrl, 0.8, 150)
                }
                this.interaction.deselect()
                cs.grabKey = null; cs.grabOffset = null
              }
            }
          })

          const dragObs = this.scene.onBeforeRenderObservable.add(() => {
            const cs = ctrlState[hand]
            if (!cs?.grabKey || !cs.grabOffset) return
            const node    = this.pumpModel?.parts?.[cs.grabKey]
            const ctrlPos = this._getCtrlPos(ctrl)
            if (node && ctrlPos) {
              const targetWorld = ctrlPos.subtract(cs.grabOffset)
              node.position = this._worldToLocal(targetWorld, node)
              this.interaction?._updateSnapRing?.(cs.grabKey)
            }
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
              this.assembly.montar(true); this._toast('🔩 Montando...')
            } else {
              this.assembly.explodir(true); this._toast('💥 Explodindo...')
            }
            this._hapticPulse(ctrl, 0.3, 60)
          })
        }

        // ── B / Y → cinemática ou próximo passo ──────────────────────
        const btnBY = mc.getComponent('b-button') || mc.getComponent('y-button')
        if (btnBY) {
          btnBY.onButtonStateChangedObservable.add(comp => {
            if (!comp.pressed) return
            if (this.assembly.modo === 'guiado') {
              this.assembly.guidedAdvance()
              this._toast('📋 Próximo passo')
            } else if (this.anim && !this.anim.isPlaying) {
              this._toast('🎬 Cinemática...')
              this.anim.playDisassembly((key, i, total) => {
                this._toast(`🔧 ${i+1}/${total}`)
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
            this._toast('📋 Menu')
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
  // MANIPULAÇÃO COM DOIS PONTOS (rotate + scale)
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
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════
  _getCtrlPos(ctrl) {
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
      const gamepad = ctrl.inputSource?.gamepad
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

  _toast(msg) {
    const el = document.getElementById('toast')
    if (!el) return
    el.textContent = msg
    el.className   = 'toast toast-info visible'
    clearTimeout(this._toastTimer)
    this._toastTimer = setTimeout(() => el.classList.remove('visible'), 2000)
  }

  _showDesktopWarning() {
    const el = document.getElementById('xr-status')
    if (el) {
      el.textContent = '⚠️ WebXR não disponível — modo desktop ativo. Use o Meta Browser no Quest.'
      el.style.display = 'block'
    }
  }
}
