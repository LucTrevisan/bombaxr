/**
 * XRManager v6 — WebXR completo para Meta Quest Pro
 * 
 * ✅ POINTER SELECTION — botões GUI funcionam com controles e mãos
 * ✅ NEAR INTERACTION — mãos próximas de peças as destacam
 * ✅ HAND TRACKING — pinch para pegar, dois pinches para escalar/girar
 * ✅ CONTROLES — trigger, grip, botões A/B/X/Y
 * ✅ ROTATE + SCALE do objeto inteiro com dois controles
 */
import * as BABYLON from '@babylonjs/core'

const PINCH_ON  = 0.025
const PINCH_OFF = 0.055

export class XRManager {
  constructor(scene, interaction, assembly) {
    this.scene       = scene
    this.interaction = interaction
    this.assembly    = assembly
    this.xrHelper    = null
    this.vrUI        = null
    this.inXR        = false

    // Estado de grab de peça individual
    this._grabState  = { key: null, offset: null }

    // Estado de pinch por mão
    this._pinchL = false
    this._pinchR = false
    this._pinchPosL = null  // posição do pinch esquerdo
    this._pinchPosR = null  // posição do pinch direito

    // Estado de manipulação do objeto inteiro (dois controles/mãos)
    this._objManip = {
      active:   false,
      initDist: null,   // distância inicial entre os dois pontos
      initScale: null,  // escala inicial da bomba
      initMidpoint: null,
      initRotY: null,   // rotação Y inicial
      initAngle: null,  // ângulo inicial entre os dois pontos
    }
  }

  async init() {
    const supported = await BABYLON.WebXRSessionManager
      .IsSessionSupportedAsync('immersive-vr').catch(() => false)

    if (!supported) {
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
        inputOptions: { doNotLoadControllerMeshes: false }
      })

      this.xrHelper.baseExperience.camera.position =
        new BABYLON.Vector3(0, 1.6, -1.5)

      const fm = this.xrHelper.baseExperience.featuresManager

      // ── 1. POINTER SELECTION — botões GUI funcionam ───────────────────
      try {
        fm.enableFeature(BABYLON.WebXRFeatureName.POINTER_SELECTION, 'stable', {
          xrInput: this.xrHelper.input,
          enablePointerSelectionOnAllControllers: true,
        })
        console.log('✅ Pointer Selection ativado')
      } catch (e) { console.warn('Pointer selection:', e.message) }

      // ── 2. HAND TRACKING ─────────────────────────────────────────────
      try {
        fm.enableFeature(BABYLON.WebXRFeatureName.HAND_TRACKING, 'latest', {
          xrInput:     this.xrHelper.input,
          jointMeshes: { enablePhysics: false, invisible: false },
        })
        console.log('✅ Hand tracking ativado')
        this._setupHandTracking()
      } catch (e) {
        console.log('Hand tracking indisponível:', e.message)
      }

      // ── 3. NEAR INTERACTION — mãos próximas ──────────────────────────
      try {
        fm.enableFeature(BABYLON.WebXRFeatureName.NEAR_INTERACTION, 'latest', {
          xrInput: this.xrHelper.input,
        })
        console.log('✅ Near Interaction ativado')
      } catch (e) { console.log('Near interaction indisponível') }

      // ── 4. TELEPORTE ─────────────────────────────────────────────────
      try {
        fm.enableFeature(BABYLON.WebXRFeatureName.TELEPORTATION, 'stable', {
          xrInput: this.xrHelper.input, floorMeshes: []
        })
      } catch {}

      // ── 5. CONTROLADORES FÍSICOS ──────────────────────────────────────
      this._setupControllers()

      // ── Estado VR ─────────────────────────────────────────────────────
      this.xrHelper.baseExperience.onStateChangedObservable.add(state => {
        if (state === BABYLON.WebXRState.IN_XR) {
          this.inXR = true
          this.vrUI?.onEnterVR()
          console.log('✅ Entrou no VR')
        } else if (state === BABYLON.WebXRState.NOT_IN_XR) {
          this.inXR = false
          this.vrUI?.onExitVR()
        }
      })

      console.log('✅ WebXR v6 inicializado')
    } catch (e) {
      console.error('Erro WebXR:', e)
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // HAND TRACKING
  // ══════════════════════════════════════════════════════════════════════
  _setupHandTracking() {
    const handData = {}  // por handedness

    this.xrHelper.input.onControllerAddedObservable.add(ctrl => {
      if (!ctrl.inputSource?.hand) return
      const hand = ctrl.inputSource.handedness

      handData[hand] = {
        ctrl,
        pinchActive: false,
        frames: 0,
        pinchPos: null,
      }

      this.scene.registerBeforeRender(() => {
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

        // Near interaction — highlight peças próximas
        this._nearHighlight(center, 0.15)

        // Pinch ON
        if (!hd.pinchActive && dist < PINCH_ON) {
          hd.frames++
          if (hd.frames >= 2) {
            hd.pinchActive = true
            hd.frames      = 0
            hd.pinchPos    = center.clone()

            if (hand === 'left')  { this._pinchL = true; this._pinchPosL = center.clone() }
            if (hand === 'right') { this._pinchR = true; this._pinchPosR = center.clone() }

            this._onPinchStart(hand, center)
          }
        }

        // Pinch OFF
        if (hd.pinchActive && dist > PINCH_OFF) {
          hd.pinchActive = false
          hd.frames      = 0
          hd.pinchPos    = null

          if (hand === 'left')  { this._pinchL = false; this._pinchPosL = null }
          if (hand === 'right') { this._pinchR = false; this._pinchPosR = null }

          this._onPinchEnd(hand, center)
          this._objManip.active = false
        }

        // Atualizar posição do pinch ativo
        if (hd.pinchActive) {
          if (hand === 'left')  this._pinchPosL = center.clone()
          if (hand === 'right') this._pinchPosR = center.clone()
          hd.pinchPos = center.clone()
        }

        // Arrastar peça individual
        if (hd.pinchActive && hand === 'right' && this._grabState.key) {
          const node = window._app?.pumpModel?.parts?.[this._grabState.key]
          if (node && this._grabState.offset) {
            node.position = center.subtract(this._grabState.offset)
          }
        }

        // Manipulação com dois pinches (rotate + scale)
        if (this._pinchL && this._pinchR && this._pinchPosL && this._pinchPosR) {
          this._updateObjManip(this._pinchPosL, this._pinchPosR)
        }
      })
    })
  }

  _onPinchStart(hand, center) {
    // Dois pinches simultâneos = iniciar manipulação do objeto inteiro
    if (this._pinchL && this._pinchR && this._pinchPosL && this._pinchPosR) {
      this._startObjManip(this._pinchPosL, this._pinchPosR)
      return
    }

    if (hand === 'left') {
      // Pinch esquerdo sozinho = toggle explodir/montar
      setTimeout(() => {
        if (!this._pinchR) {  // confirmar que não é dois pinches
          if (this.assembly.isExploded) {
            this.assembly.montar(true)
            this._toast('🔩 Montando...')
          } else {
            this.assembly.explodir(true)
            this._toast('💥 Explodindo...')
          }
        }
      }, 150)
    }

    if (hand === 'right') {
      // Pinch direito = tentar pegar peça
      const hit = this._nearestMesh(center, 0.15)
      if (hit?.metadata?.partKey) {
        const key  = hit.metadata.partKey
        const node = window._app?.pumpModel?.parts?.[key]
        if (node) {
          this._grabState = { key, offset: center.subtract(node.position) }
          this.interaction.select(key)
          this.vrUI?.showPartInfoVR(key)
          this._toast('✋ ' + (window._app?.pumpModel?.meta?.[key]?.label || key))
        }
      }
    }
  }

  _onPinchEnd(hand, center) {
    this._objManip.active = false

    if (hand === 'right' && this._grabState.key) {
      const snapped = this.assembly.trySnap(this._grabState.key)
      if (snapped) {
        this.interaction.flashSnap(this._grabState.key)
        this._toast('✅ Encaixado!')
      }
      this.interaction.deselect()
      this._grabState = { key: null, offset: null }
    }
  }

  // ── Manipulação do objeto inteiro (dois pontos) ───────────────────────
  _startObjManip(posL, posR) {
    const root = window._app?.pumpModel?.rootNode
    if (!root) return

    const dist  = BABYLON.Vector3.Distance(posL, posR)
    const mid   = BABYLON.Vector3.Lerp(posL, posR, 0.5)
    const angle = Math.atan2(posR.z - posL.z, posR.x - posL.x)

    this._objManip = {
      active:      true,
      initDist:    dist,
      initScale:   root.scaling.x,
      initMidpoint: mid.clone(),
      initRotY:    root.rotation.y,
      initAngle:   angle,
    }
  }

  _updateObjManip(posL, posR) {
    if (!this._objManip.active) {
      this._startObjManip(posL, posR)
      return
    }

    const root = window._app?.pumpModel?.rootNode
    if (!root) return

    const m = this._objManip

    // Escala — baseada na mudança de distância
    const currDist = BABYLON.Vector3.Distance(posL, posR)
    const scaleFactor = currDist / m.initDist
    const newScale = Math.max(0.5, Math.min(6.0, m.initScale * scaleFactor))
    root.scaling.setAll(newScale)

    // Rotação Y — baseada na mudança de ângulo
    const currAngle = Math.atan2(posR.z - posL.z, posR.x - posL.x)
    const deltaAngle = currAngle - m.initAngle
    root.rotation.y = m.initRotY + deltaAngle

    // Toast de feedback
    if (!this._scaleToastTimer) {
      this._scaleToastTimer = setTimeout(() => {
        this._toast(`📏 Escala: ${newScale.toFixed(1)}x`)
        this._scaleToastTimer = null
      }, 500)
    }
  }

  // ── Near interaction — highlight ao aproximar ─────────────────────────
  _nearHighlight(pos, radius) {
    this.scene.meshes.forEach(m => {
      if (!m.isPickable || !m.metadata?.partKey) return
      const dist = BABYLON.Vector3.Distance(pos, m.getAbsolutePosition())
      if (dist < radius) {
        // Destacar se não estiver selecionado
        if (!this._grabState.key) {
          this.interaction?.highlight?.(m.metadata.partKey)
        }
      }
    })
  }

  // ══════════════════════════════════════════════════════════════════════
  // CONTROLADORES FÍSICOS
  // ══════════════════════════════════════════════════════════════════════
  _setupControllers() {
    // Estado dos dois controles para manipulação
    const ctrlState = {}

    this.xrHelper.input.onControllerAddedObservable.add(ctrl => {
      if (ctrl.inputSource?.hand) return  // ignorar mãos aqui

      ctrl.onMotionControllerInitObservable.add(mc => {
        const hand = mc.handedness
        ctrlState[hand] = { ctrl, grabKey: null, grabOffset: null, triggerDown: false }

        // TRIGGER → pegar peça (pointer selection cuida dos botões GUI)
        const trigger = mc.getComponent('xr-standard-trigger')
        if (trigger) {
          trigger.onButtonStateChangedObservable.add(comp => {
            const cs = ctrlState[hand]
            if (comp.pressed && !cs.triggerDown) {
              cs.triggerDown = true

              // Raycast para peças
              const ray = new BABYLON.Ray(BABYLON.Vector3.Zero(), BABYLON.Vector3.Forward())
              ctrl.getWorldPointerRayToRef(ray)
              const pick = this.scene.pickWithRay(ray,
                m => m.isPickable && m.metadata?.partKey && m.isEnabled()
              )
              if (pick?.hit && pick.pickedMesh?.metadata?.partKey) {
                cs.grabKey = pick.pickedMesh.metadata.partKey
                const node    = window._app?.pumpModel?.parts?.[cs.grabKey]
                const ctrlPos = ctrl.pointer?.position || ctrl.grip?.position
                if (node && ctrlPos) cs.grabOffset = ctrlPos.subtract(node.position)
                this.interaction.select(cs.grabKey)
                this.vrUI?.showPartInfoVR(cs.grabKey)
              }
            } else if (!comp.pressed && cs.triggerDown) {
              cs.triggerDown = false
              if (cs.grabKey) {
                const snapped = this.assembly.trySnap(cs.grabKey)
                if (snapped) {
                  this.interaction.flashSnap(cs.grabKey)
                  this._toast('✅ Encaixado!')
                }
                this.interaction.deselect()
                cs.grabKey = null; cs.grabOffset = null
              }
            }
          })

          // Mover peça com trigger
          this.scene.registerBeforeRender(() => {
            const cs = ctrlState[hand]
            if (!cs?.grabKey || !cs.grabOffset) return
            const node    = window._app?.pumpModel?.parts?.[cs.grabKey]
            const ctrlPos = ctrl.pointer?.position || ctrl.grip?.position
            if (node && ctrlPos) node.position = ctrlPos.subtract(cs.grabOffset)
          })
        }

        // GRIP → mover objeto inteiro
        const grip = mc.getComponent('xr-standard-squeeze')
        if (grip) {
          let grabOffset = null

          grip.onButtonStateChangedObservable.add(comp => {
            const root = window._app?.pumpModel?.rootNode
            if (!root) return
            const ctrlPos = ctrl.grip?.position || ctrl.pointer?.position

            if (comp.pressed && ctrlPos) {
              grabOffset = ctrlPos.subtract(root.position)
            } else {
              grabOffset = null
            }
          })

          this.scene.registerBeforeRender(() => {
            if (!grabOffset) return
            const root    = window._app?.pumpModel?.rootNode
            const ctrlPos = ctrl.grip?.position || ctrl.pointer?.position
            if (root && ctrlPos) root.position = ctrlPos.subtract(grabOffset)
          })
        }

        // BOTÃO A/X → explodir/montar
        const btnAX = mc.getComponent('a-button') || mc.getComponent('x-button')
        if (btnAX) {
          btnAX.onButtonStateChangedObservable.add(comp => {
            if (!comp.pressed) return
            if (this.assembly.isExploded) {
              this.assembly.montar(true)
              this._toast('🔩 Montando...')
            } else {
              this.assembly.explodir(true)
              this._toast('💥 Explodindo...')
            }
          })
        }

        // BOTÃO B/Y → próximo passo guiado
        const btnBY = mc.getComponent('b-button') || mc.getComponent('y-button')
        if (btnBY) {
          btnBY.onButtonStateChangedObservable.add(comp => {
            if (!comp.pressed) return
            this.assembly.guidedAdvance()
            this._toast('📋 Próximo passo')
          })
        }

        // THUMBSTICK direito → rotacionar objeto
        const stickR = mc.getComponent('xr-standard-thumbstick')
        if (stickR && hand === 'right') {
          stickR.onAxisValueChangedObservable.add(axes => {
            const root = window._app?.pumpModel?.rootNode
            if (root && Math.abs(axes.x) > 0.2) {
              root.rotation.y += axes.x * 0.03
            }
          })
        }

        // THUMBSTICK esquerdo pressionar → toggle menu
        const stickL = mc.getComponent('xr-standard-thumbstick')
        if (stickL && hand === 'left') {
          stickL.onButtonStateChangedObservable.add(comp => {
            if (!comp.pressed) return
            const main = this.vrUI?._panels?.mainPlane
            if (main) main.setEnabled(!main.isEnabled())
            this._toast('📋 Menu')
          })

          // Escala com analógico esquerdo (cima/baixo)
          stickL.onAxisValueChangedObservable.add(axes => {
            const root = window._app?.pumpModel?.rootNode
            if (root && Math.abs(axes.y) > 0.3) {
              const delta = -axes.y * 0.01
              const ns    = Math.max(0.5, Math.min(6.0, root.scaling.x + delta))
              root.scaling.setAll(ns)
            }
          })
        }
      })
    })
  }

  // ══════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════
  _jPos(joint) {
    try {
      const frame = this.xrHelper.baseExperience.sessionManager.currentFrame
      const pose  = frame?.getJointPose?.(
        joint,
        this.xrHelper.baseExperience.sessionManager.referenceSpace
      )
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
