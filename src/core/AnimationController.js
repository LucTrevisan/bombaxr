/**
 * AnimationController — Animações cinemáticas, rotor e fluxo
 */
import * as BABYLON from '@babylonjs/core'
import { MONTAGEM_SEQ, DESMONTAGEM_SEQ } from '../utils/constants.js'

export class AnimationController {
  constructor(scene, pumpModel, sceneManager) {
    this.scene          = scene
    this.pumpModel      = pumpModel
    this.sceneManager   = sceneManager
    this.isPlaying      = false
    this._rotorObs      = null
    this._flowParticles = null
  }

  // ── Desmontagem cinemática ────────────────────────────────────────────────
  async playDisassembly(onStep) {
    if (this.isPlaying) return
    this.isPlaying = true

    // Primeiro montar para garantir posição inicial correta
    const assembly = window._app?.assembly
    if (assembly) {
      await assembly.montar(false)
      await this._wait(300)
    }

    // Animar cada peça na sequência de desmontagem
    for (let i = 0; i < DESMONTAGEM_SEQ.length; i++) {
      const key  = DESMONTAGEM_SEQ[i]
      const node = this.pumpModel.parts[key]
      if (!node) continue

      // Highlight da peça
      window._app?.interaction?.select(key)

      // Zoom suave na peça (sem ficar muito perto)
      await this._orbitTo(node.getAbsolutePosition?.() || node.position, 3.5, 400)

      // Mover para posição explodida usando os offsets do AssemblyManager
      const origin = this.pumpModel.originPos[key]
      const offset = assembly?._getExplodeOffset?.(key)
        ?? this._defaultOffset(key)
      const target = origin.add(offset)
      await this._animTo(node, target, 500)

      onStep?.(key, i, DESMONTAGEM_SEQ.length)
      await this._wait(150)
      window._app?.interaction?.deselect()
    }

    // Giro final da câmera
    await this._spinCamera(2000)
    this.isPlaying = false
  }

  // ── Montagem cinemática ───────────────────────────────────────────────────
  async playAssembly(onStep) {
    if (this.isPlaying) return
    this.isPlaying = true

    for (let i = 0; i < MONTAGEM_SEQ.length; i++) {
      const key  = MONTAGEM_SEQ[i]
      const node = this.pumpModel.parts[key]
      if (!node) continue

      window._app?.interaction?.select(key)
      await this._orbitTo(node.getAbsolutePosition?.() || node.position, 3.5, 600)
      await this._animTo(node, this.pumpModel.originPos[key].clone(), 700)
      window._app?.audio?.playSnap()
      onStep?.(key, i, MONTAGEM_SEQ.length)
      await this._wait(3000)
      window._app?.interaction?.deselect()
    }

    window._app?.audio?.playComplete()
    await this._spinCamera(1500)
    this.isPlaying = false
  }

  // ── Showcase 360° ─────────────────────────────────────────────────────────
  async playShowcase(ms = 4000) {
    const root = this.pumpModel.rootNode
    if (!root) return
    const startY = root.rotation.y
    const t0     = performance.now()
    return new Promise(resolve => {
      const tick = () => {
        const t = (performance.now() - t0) / ms
        if (t >= 1) { root.rotation.y = startY; resolve(); return }
        root.rotation.y = startY + t * Math.PI * 2
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
  }

  // ── Rotor girando ─────────────────────────────────────────────────────────
  startRotor(rpm = 1450) {
    // Se já está girando — PARAR
    if (this._rotorObs) {
      this.stopRotor()
      return
    }

    const rps = (rpm / 60) * Math.PI * 2
    const rotor = this.pumpModel.parts['pump_impeller']
      || Object.entries(this.pumpModel.parts)
           .find(([k]) => k.includes('impeller') || k.includes('impellar'))?.[1]

    if (!rotor) {
      console.warn('⚠️ Rotor não encontrado:', Object.keys(this.pumpModel.parts))
      return
    }

    console.log(`⚙️ Rotor ligado: ${rpm} RPM`)
    this._rotorNode  = rotor
    this._rotorAngle = rotor.rotation?.z || 0

    // Forçar Euler — GLB usa quaternion por padrão
    const forceEuler = n => {
      if (!n) return
      if (n.rotationQuaternion) {
        n.rotation = n.rotationQuaternion.toEulerAngles()
        n.rotationQuaternion = null
      }
    }
    forceEuler(rotor)
    rotor.getChildMeshes?.().forEach(forceEuler)

    // Salvar rotações originais X e Y para preservar
    const origX = rotor.rotation?.x || 0
    const origY = rotor.rotation?.y || 0

    this._rotorObs = this.scene.registerBeforeRender(() => {
      const dt = this.scene.getEngine().getDeltaTime() / 1000
      this._rotorAngle += rps * dt

      const spin = n => {
        if (!n) return
        if (n.rotationQuaternion) {
          n.rotationQuaternion = null
        }
        if (n.rotation) {
          // Fixar X e Y nas posições originais, girar SOMENTE Z
          n.rotation.x = origX
          n.rotation.y = origY
          n.rotation.z = this._rotorAngle
        }
      }
      spin(this._rotorNode)
    })
  }

  stopRotor() {
    if (this._rotorObs) {
      this.scene.unregisterBeforeRender(this._rotorObs)
      this._rotorObs = null
      console.log('⚙️ Rotor desligado')
    }
  }

  // ── Fluxo de líquido ──────────────────────────────────────────────────────
  startFlow() {
    if (this._flowParticles) return
    const ps       = new BABYLON.ParticleSystem('flow', 200, this.scene)
    const impeller = this.pumpModel.parts['pump_impeller']
    ps.emitter     = impeller || new BABYLON.Vector3(0, 0.24, -0.19)
    ps.minEmitBox  = new BABYLON.Vector3(-0.05,-0.05,-0.05)
    ps.maxEmitBox  = new BABYLON.Vector3( 0.05, 0.05, 0.05)
    ps.color1      = new BABYLON.Color4(0.2, 0.6, 1.0, 0.8)
    ps.color2      = new BABYLON.Color4(0.0, 0.9, 1.0, 0.4)
    ps.minSize     = 0.015; ps.maxSize = 0.035
    ps.minLifeTime = 0.3;   ps.maxLifeTime = 0.7
    ps.emitRate    = 120
    ps.minEmitPower = 0.4;  ps.maxEmitPower = 0.9
    ps.direction1  = new BABYLON.Vector3(-1, 0, 0)
    ps.direction2  = new BABYLON.Vector3(-1, 0.5, 0.5)
    ps.gravity     = new BABYLON.Vector3(0, -1, 0)
    ps.blendMode   = BABYLON.ParticleSystem.BLENDMODE_ADD
    ps.start()
    this._flowParticles = ps
    console.log('💧 Fluxo ativado')
  }

  stopFlow() {
    this._flowParticles?.stop()
    this._flowParticles?.dispose()
    this._flowParticles = null
  }

  // ── Offset padrão para cinemática ─────────────────────────────────────────
  _defaultOffset(key) {
    const base = key.replace(/_\d+$/, '')
    const map  = {
      pump_casing:        new BABYLON.Vector3(0, 0, -0.50),
      pump_impeller:      new BABYLON.Vector3(0, 0, -0.75),
      wear_ring:          new BABYLON.Vector3(0, 0, -0.95),
      seal_chamber:       new BABYLON.Vector3(0, 0, -0.40),
      pump_lantern_ring:  new BABYLON.Vector3(0, 0, -0.55),
      pump_packing_set:   new BABYLON.Vector3(0, 0, -0.65),
      pump_packing_gland: new BABYLON.Vector3(0, 0, -0.30),
      house_bearing:      new BABYLON.Vector3(0, 0.45, 0),
      shaft:              new BABYLON.Vector3(0, 0.60, 0),
      bearing_cover:      new BABYLON.Vector3(0, 0,  0.50),
      pump_coupling:      new BABYLON.Vector3(0, 0,  0.65),
      coupling:           new BABYLON.Vector3(0, 0,  0.80),
      pump_protection:    new BABYLON.Vector3(0, 0,  0.95),
    }
    return map[base] || new BABYLON.Vector3(0, 0.4, 0)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  _animTo(node, target, ms, delay = 0) {
    return new Promise(resolve => {
      setTimeout(() => {
        const start = node.position.clone()
        const t0    = performance.now()
        const tick  = () => {
          const t = Math.min((performance.now() - t0) / ms, 1)
          const e = t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2
          node.position = BABYLON.Vector3.Lerp(start, target, e)
          t < 1 ? requestAnimationFrame(tick) : (node.position = target.clone(), resolve())
        }
        requestAnimationFrame(tick)
      }, delay)
    })
  }

  _orbitTo(target, radius, ms) {
    const cam = this.sceneManager?.camera
    if (!cam) return this._wait(ms)
    const startTarget = cam.target.clone()
    const startRadius = cam.radius
    const t0 = performance.now()
    return new Promise(resolve => {
      const tick = () => {
        const t = Math.min((performance.now()-t0)/ms, 1)
        const e = t < .5 ? 2*t*t : -1+(4-2*t)*t
        cam.target = BABYLON.Vector3.Lerp(startTarget, target, e)
        cam.radius = startRadius + (radius - startRadius) * e
        t < 1 ? requestAnimationFrame(tick) : resolve()
      }
      requestAnimationFrame(tick)
    })
  }

  _spinCamera(ms) {
    const cam = this.sceneManager?.camera
    if (!cam) return this._wait(ms)
    const startA = cam.alpha
    const t0     = performance.now()
    return new Promise(resolve => {
      const tick = () => {
        const t = Math.min((performance.now()-t0)/ms, 1)
        cam.alpha = startA + t * Math.PI * 2
        t < 1 ? requestAnimationFrame(tick) : resolve()
      }
      requestAnimationFrame(tick)
    })
  }

  _wait(ms) { return new Promise(r => setTimeout(r, ms)) }
}
