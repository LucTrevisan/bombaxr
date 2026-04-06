/**
 * XRManager — WebXR com hand tracking para Meta Quest
 */
import * as BABYLON from '@babylonjs/core'

export class XRManager {
  constructor(scene, interaction, assembly) {
    this.scene       = scene
    this.interaction = interaction
    this.assembly    = assembly
    this.xrHelper    = null
    this.inXR        = false
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
        floorMeshes:     [],
        optionalFeatures: true,
        uiOptions: {
          sessionMode:        'immersive-vr',
          referenceSpaceType: 'local-floor',
        },
      })

      // Posição inicial da câmera VR
      const cam = this.xrHelper.baseExperience.camera
      cam.position = new BABYLON.Vector3(0, 1.6, -1.5)

      // Hand tracking
      try {
        const fm = this.xrHelper.baseExperience.featuresManager
        fm.enableFeature(BABYLON.WebXRFeatureName.HAND_TRACKING, 'latest', {
          xrInput: this.xrHelper.input,
          jointMeshes: { enablePhysics: false, invisible: false },
        })
        console.log('✅ Hand tracking ativado')
        this._setupHandInteraction()
      } catch (e) {
        console.log('Hand tracking indisponível — usando controladores')
        this._setupControllerInteraction()
      }

      // Teleporte
      try {
        const fm = this.xrHelper.baseExperience.featuresManager
        fm.enableFeature(BABYLON.WebXRFeatureName.TELEPORTATION, 'stable', {
          xrInput: this.xrHelper.input,
          floorMeshes: [],
        })
      } catch {}

      // Estado da sessão
      this.xrHelper.baseExperience.onStateChangedObservable.add(state => {
        this.inXR = state === BABYLON.WebXRState.IN_XR
      })

      console.log('✅ WebXR inicializado')
    } catch (e) {
      console.error('Erro WebXR:', e)
    }
  }

  _setupHandInteraction() {
    this.xrHelper.input.onControllerAddedObservable.add(ctrl => {
      if (!ctrl.inputSource?.hand) return
      let pinchActive = false
      let grabKey     = null
      let grabOffset  = null
      const PINCH_ON  = 0.025
      const PINCH_OFF = 0.050

      this.scene.registerBeforeRender(() => {
        const hand  = ctrl.inputSource?.hand
        const thumb = hand?.get('thumb-tip')
        const index = hand?.get('index-finger-tip')
        if (!thumb || !index) return

        const tp = this._jPos(thumb)
        const ip = this._jPos(index)
        if (!tp || !ip) return

        const dist   = BABYLON.Vector3.Distance(tp, ip)
        const center = BABYLON.Vector3.Lerp(tp, ip, 0.5)

        if (!pinchActive && dist < PINCH_ON) {
          pinchActive = true
          const hit   = this._nearestMesh(center, 0.10)
          if (hit) {
            grabKey    = hit.metadata?.partKey
            const node = this.pumpModel?.parts?.[grabKey]
            if (node) grabOffset = center.subtract(node.position)
            if (grabKey) this.interaction.select(grabKey)
          }
        } else if (pinchActive && dist > PINCH_OFF) {
          pinchActive = false
          if (grabKey) {
            const snapped = this.assembly.trySnap(grabKey)
            if (snapped) this.interaction.flashSnap(grabKey)
            this.interaction.deselect()
            grabKey = null; grabOffset = null
          }
        }

        if (pinchActive && grabKey && grabOffset) {
          const node = window._app?.pumpModel?.parts?.[grabKey]
          if (node) node.position = center.subtract(grabOffset)
        }
      })
    })
  }

  _setupControllerInteraction() {
    this.xrHelper.input.onControllerAddedObservable.add(ctrl => {
      ctrl.onMotionControllerInitObservable.add(mc => {
        const trigger = mc.getComponent('xr-standard-trigger')
        if (!trigger) return
        let grabKey   = null

        trigger.onButtonStateChangedObservable.add(comp => {
          if (comp.pressed) {
            const ray  = new BABYLON.Ray(BABYLON.Vector3.Zero(), BABYLON.Vector3.Forward())
            ctrl.getWorldPointerRayToRef(ray)
            const pick = this.scene.pickWithRay(ray)
            if (pick.hit && pick.pickedMesh?.metadata?.partKey) {
              grabKey = pick.pickedMesh.metadata.partKey
              this.interaction.select(grabKey)
            }
          } else {
            if (grabKey) {
              const snapped = this.assembly.trySnap(grabKey)
              if (snapped) this.interaction.flashSnap(grabKey)
              this.interaction.deselect()
              grabKey = null
            }
          }
        })
      })
    })
  }

  _jPos(joint) {
    try {
      const frame = this.xrHelper.baseExperience.sessionManager.currentFrame
      const pose  = frame?.getJointPose?.(joint,
        this.xrHelper.baseExperience.sessionManager.referenceSpace)
      if (!pose) return null
      const p = pose.transform.position
      return new BABYLON.Vector3(p.x, p.y, p.z)
    } catch { return null }
  }

  _nearestMesh(pos, r) {
    return this.scene.meshes
      .filter(m => m.isPickable && m.metadata?.partKey)
      .find(m => BABYLON.Vector3.Distance(pos, m.getAbsolutePosition()) < r)
  }

  _showDesktopWarning() {
    const el = document.getElementById('xr-status')
    if (el) {
      el.textContent = '⚠️ WebXR não disponível — modo desktop ativo. Use o Meta Browser no Quest.'
      el.style.display = 'block'
    }
  }
}
