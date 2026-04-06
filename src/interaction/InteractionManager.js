/**
 * InteractionManager — Seleção, highlight, drag (desktop + VR)
 */
import * as BABYLON from '@babylonjs/core'

export class InteractionManager {
  constructor(scene, pumpModel, assemblyManager, audio) {
    this.scene           = scene
    this.pumpModel       = pumpModel
    this.assemblyManager = assemblyManager
    this.audio           = audio
    this.selectedKey     = null
    this.hoveredKey      = null
    this._hl             = null
    this._dragPlane      = null
    this._dragging       = false
    this._dragOffset     = null
    this._canvas         = null
    this._snapRings      = {}
  }

  init() {
    this._canvas = this.scene.getEngine().getRenderingCanvas()
    this._hl     = new BABYLON.HighlightLayer('hl', this.scene)
    this._hl.innerGlow        = false
    this._hl.outerGlow        = true
    this._hl.blurHorizontalSize = 0.8
    this._hl.blurVerticalSize   = 0.8

    // Plano de arrasto
    this._dragPlane = BABYLON.MeshBuilder.CreatePlane('dragPlane', {size:20}, this.scene)
    this._dragPlane.isPickable = false
    this._dragPlane.isVisible  = false
    this._dragPlane.setEnabled(false)

    this._buildSnapRings()
    this._setupEvents()
  }

  _buildSnapRings() {
    Object.entries(this.pumpModel.parts).forEach(([key, node]) => {
      const ring = BABYLON.MeshBuilder.CreateTorus(`ring_${key}`, {
        diameter: 0.22, thickness: 0.008, tessellation: 48
      }, this.scene)
      ring.position   = this.pumpModel.originPos[key].clone()
      ring.isPickable = false
      ring.visibility = 0

      const mat = new BABYLON.StandardMaterial(`ringMat_${key}`, this.scene)
      mat.emissiveColor = new BABYLON.Color3(0, 1, 0.5)
      mat.disableLighting = true
      ring.material = mat

      // Animação de pulso
      const anim = new BABYLON.Animation(`pulse_${key}`,'scaling',30,
        BABYLON.Animation.ANIMATIONTYPE_VECTOR3,
        BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE)
      anim.setKeys([
        {frame:0,  value: new BABYLON.Vector3(1,1,1)},
        {frame:15, value: new BABYLON.Vector3(1.3,1.3,1.3)},
        {frame:30, value: new BABYLON.Vector3(1,1,1)},
      ])
      ring.animations = [anim]
      this.scene.beginAnimation(ring,0,30,true)
      this._snapRings[key] = ring
    })
  }

  _setupEvents() {
    this.scene.onPointerObservable.add(info => {
      switch (info.type) {
        case BABYLON.PointerEventTypes.POINTERMOVE: this._onMove(info); break
        case BABYLON.PointerEventTypes.POINTERDOWN: this._onDown(info); break
        case BABYLON.PointerEventTypes.POINTERUP:   this._onUp();       break
      }
    })
  }

  _onMove(info) {
    if (this._dragging && this.selectedKey) {
      const pick = this.scene.pick(
        this.scene.pointerX, this.scene.pointerY,
        m => m === this._dragPlane
      )
      if (pick.hit && pick.pickedPoint) {
        const node = this.pumpModel.parts[this.selectedKey]
        if (node) node.position = pick.pickedPoint.subtract(this._dragOffset)
        this._updateSnapRing(this.selectedKey)
      }
      return
    }

    const pick = this.scene.pick(
      this.scene.pointerX, this.scene.pointerY,
      m => m.isPickable && m.metadata?.partKey
    )
    const key = pick.hit ? pick.pickedMesh?.metadata?.partKey : null
    if (key !== this.hoveredKey) {
      if (this.hoveredKey && this.hoveredKey !== this.selectedKey)
        this._removeHl(this.hoveredKey)
      this.hoveredKey = key
      if (key && key !== this.selectedKey) {
        this._addHl(key, new BABYLON.Color3(0.5, 0.6, 1.0))
        if (this._canvas) this._canvas.style.cursor = 'pointer'
        this.audio?.playHover()
      } else {
        if (this._canvas) this._canvas.style.cursor = 'default'
      }
    }
  }

  _onDown(info) {
    const pick = this.scene.pick(
      this.scene.pointerX, this.scene.pointerY,
      m => m.isPickable && m.metadata?.partKey
    )
    if (pick.hit && pick.pickedMesh?.metadata?.partKey) {
      const key  = pick.pickedMesh.metadata.partKey
      const meta = this.pumpModel.meta?.[key]
      if (meta?.interactive === false) return

      const node = this.pumpModel.parts[key]
      this.select(key)
      this.audio?.playSelect()

      // Configurar plano de arrasto
      const cam     = this.scene.activeCamera
      const forward = cam.getForwardRay().direction
      this._dragPlane.setEnabled(true)
      this._dragPlane.isPickable = true
      if (!this._dragPlane.rotationQuaternion)
        this._dragPlane.rotationQuaternion = new BABYLON.Quaternion()
      BABYLON.Quaternion.FromUnitVectorsToRef(
        BABYLON.Vector3.Forward(), forward.negate(),
        this._dragPlane.rotationQuaternion
      )
      this._dragPlane.position = pick.pickedPoint.clone()
      this._dragging   = true
      this._dragOffset = pick.pickedPoint.subtract(node.position)
    } else {
      this.deselect()
    }
  }

  _onUp() {
    if (this._dragging && this.selectedKey) {
      const snapped = this.assemblyManager.trySnap(this.selectedKey)
      if (snapped) {
        this.flashSnap(this.selectedKey)
        this._hideSnapRing(this.selectedKey)
      }
    }
    this._dragging = false
    this._dragPlane.setEnabled(false)
    this._dragPlane.isPickable = false
  }

  select(key) {
    if (this.selectedKey && this.selectedKey !== key) this._removeHl(this.selectedKey)
    this.selectedKey = key
    this._addHl(key, new BABYLON.Color3(0, 1.0, 0.85))
  }

  deselect() {
    if (this.selectedKey) this._removeHl(this.selectedKey)
    this.selectedKey = null
    this._hideAllSnapRings()
  }

  _addHl(key, color) {
    this.pumpModel.getMeshesForKey(key).forEach(m => {
      try { this._hl.addMesh(m, color) } catch {}
    })
  }

  _removeHl(key) {
    this.pumpModel.getMeshesForKey(key).forEach(m => {
      try { this._hl.removeMesh(m) } catch {}
    })
  }

  flashSnap(key) {
    let c = 0
    const iv = setInterval(() => {
      if (c%2===0) this._addHl(key, new BABYLON.Color3(0.2,1,0.4))
      else this._removeHl(key)
      if (++c>=6) { clearInterval(iv); this._removeHl(key) }
    }, 100)
  }

  flashErro(key) {
    let c = 0
    const iv = setInterval(() => {
      if (c%2===0) this._addHl(key, new BABYLON.Color3(1,0.2,0.2))
      else this._removeHl(key)
      if (++c>=4) { clearInterval(iv); this._removeHl(key) }
    }, 90)
  }

  _updateSnapRing(key) {
    const ring   = this._snapRings[key]
    const node   = this.pumpModel.parts[key]
    const origin = this.pumpModel.originPos[key]
    if (!ring || !node) return

    const dist = BABYLON.Vector3.Distance(node.position, origin)
    const near = 0.30

    if (dist < near) {
      const t = 1 - dist/near
      ring.visibility = Math.min(t*2, 1)
      const color = BABYLON.Color3.Lerp(
        new BABYLON.Color3(0,0.8,1), new BABYLON.Color3(0,1,0.3), 1-(dist/0.12)
      )
      if (ring.material) ring.material.emissiveColor = color
    } else {
      ring.visibility = 0
    }
  }

  _hideSnapRing(key) { if (this._snapRings[key]) this._snapRings[key].visibility = 0 }
  _hideAllSnapRings() { Object.values(this._snapRings).forEach(r => r.visibility = 0) }
}
