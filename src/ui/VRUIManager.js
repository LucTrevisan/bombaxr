/**
 * VRUIManager — Painéis 3D flutuantes dentro do espaço VR
 * Visíveis e interativos com hand tracking e controladores
 */
import * as BABYLON from '@babylonjs/core'
import * as GUI     from '@babylonjs/gui'
import { MONTAGEM_SEQ } from '../utils/constants.js'

export class VRUIManager {
  constructor(scene, assembly, pumpModel) {
    this.scene    = scene
    this.assembly = assembly
    this.pumpModel = pumpModel
    this._panels  = {}
  }

  init() {
    this._buildMainPanel()
    this._buildStepPanel()
    this._bindCallbacks()
  }

  // ── Painel principal de modos ─────────────────────────────────────────────
  _buildMainPanel() {
    const plane = BABYLON.MeshBuilder.CreatePlane('vr_main',
      { width: 2.4, height: 2.0 }, this.scene)
    plane.position      = new BABYLON.Vector3(-1.2, 0.5, 2.5)
    plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y
    plane.isPickable    = true

    const tex = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 1100, 1000)

    const bg = new GUI.Rectangle()
    bg.background = '#0D1117EE'; bg.cornerRadius = 14
    bg.thickness  = 1.5;         bg.color         = '#C8102E'
    bg.width = '100%';           bg.height         = '100%'
    tex.addControl(bg)

    const stack = new GUI.StackPanel()
    stack.isVertical = true; stack.paddingTop = '12px'
    stack.paddingLeft = '12px'; stack.paddingRight = '12px'
    stack.width = '100%'
    bg.addControl(stack)

    const t = new GUI.TextBlock()
    t.text = 'BOMBA CENTRÍFUGA'; t.color = '#C8102E'
    t.fontSize = 36; t.height = '30px'
    t.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER
    stack.addControl(t)

    const s = new GUI.TextBlock()
    s.text = 'SENAI · Mecatrônica'; s.color = '#6a7d96'
    s.fontSize = 22; s.height = '20px'
    stack.addControl(s)

    const sep = new GUI.Rectangle()
    sep.height = '2px'; sep.width = '90%'
    sep.background = '#C8102E'; sep.thickness = 0; sep.paddingTop = '6px'
    stack.addControl(sep)

    const modos = [
      { id: 'visualizacao', label: '👁  Visualizar'  },
      { id: 'livre',        label: '🔧  Livre'        },
      { id: 'guiado',       label: '📋  Guiado'       },
      { id: 'avaliacao',    label: '🏆  Avaliação'    },
    ]

    modos.forEach(({ id, label }) => {
      const btn = GUI.Button.CreateSimpleButton(`vrbtn_${id}`, label)
      btn.width = '94%'; btn.height = '90px'
      btn.color = '#E0E8F0'; btn.fontSize = 26
      btn.background   = id === 'visualizacao' ? '#C8102E' : '#1A2030'
      btn.cornerRadius = 8; btn.thickness = 1
      btn.paddingTop = '3px'; btn.paddingBottom = '3px'
      btn.isEnabled    = true; btn.isHitTestVisible = true

      btn.onPointerUpObservable.add(() => {
        this.assembly.setModo(id)
        modos.forEach(m => {
          const b = this._panels[`vrbtn_${m.id}`]
          if (b) { b.background = m.id===id ? '#C8102E' : '#1A2030'; b.color = '#E0E8F0' }
        })
        // Sync HTML buttons
        document.querySelectorAll('.mode-btn').forEach(el => {
          el.classList.toggle('active', el.dataset.mode === id)
        })
      })

      stack.addControl(btn)
      this._panels[`vrbtn_${id}`] = btn
    })

    // Botão reset
    const reset = GUI.Button.CreateSimpleButton('vrbtn_reset', '↺  Reiniciar')
    reset.width = '92%'; reset.height = '75px'
    reset.color = '#ffb830'; reset.background = '#1A1508'
    reset.cornerRadius = 8; reset.fontSize = 26
    reset.paddingTop = '6px'
    reset.onPointerUpObservable.add(() => this.assembly.reset())
    stack.addControl(reset)

    this._panels.mainPlane = plane
  }

  // ── Painel de passo guiado ────────────────────────────────────────────────
  _buildStepPanel() {
    const plane = BABYLON.MeshBuilder.CreatePlane('vr_step',
      { width: 2.4, height: 1.20 }, this.scene)
    plane.position      = new BABYLON.Vector3(1.2, 0.5, 2.5)
    plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y
    plane.isPickable    = true
    plane.setEnabled(false)

    const tex = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 1100, 600)

    const bg = new GUI.Rectangle()
    bg.background = '#0D1117EE'; bg.cornerRadius = 12
    bg.thickness  = 1.5;         bg.color         = '#00C8FF'
    bg.width = '100%';           bg.height         = '100%'
    tex.addControl(bg)

    const stack = new GUI.StackPanel()
    stack.paddingTop = '10px'; stack.paddingLeft = '10px'
    stack.paddingRight = '10px'; stack.width = '100%'
    bg.addControl(stack)

    const stepLbl = new GUI.TextBlock()
    stepLbl.text = 'PASSO 1 / 18'; stepLbl.color = '#00C8FF'
    stepLbl.fontSize = 28; stepLbl.height = '26px'
    stack.addControl(stepLbl)

    const stepName = new GUI.TextBlock()
    stepName.text = '—'; stepName.color = '#E0E8F0'
    stepName.fontSize = 34; stepName.height = '30px'; stepName.fontStyle = 'bold'
    stack.addControl(stepName)

    const stepDesc = new GUI.TextBlock()
    stepDesc.text = 'Selecione e encaixe a peça indicada.'
    stepDesc.color = '#6a7d96'; stepDesc.fontSize = 12
    stepDesc.height = '36px'; stepDesc.textWrapping = true; stepDesc.width = '92%'
    stack.addControl(stepDesc)

    const next = GUI.Button.CreateSimpleButton('vr_next', '▶  Próximo Passo')
    next.width = '88%'; next.height = '38px'
    next.color = '#0D1117'; next.background = '#00C8FF'
    next.cornerRadius = 8; next.fontSize = 26; next.isEnabled = true
    next.onPointerUpObservable.add(() => this.assembly.guidedAdvance())
    stack.addControl(next)

    this._panels.stepPlane = plane
    this._panels.stepLbl   = stepLbl
    this._panels.stepName  = stepName
    this._panels.stepDesc  = stepDesc
  }

  _bindCallbacks() {
    // Usar listeners adicionais sem sobrescrever os callbacks existentes
    // Registrar como listeners secundários
    this._origStepChange  = this.assembly.onStepChange
    this._origComplete    = this.assembly.onComplete

    this.assembly.onStepChange = (key, idx, total) => {
      // Chamar callback original (HUDManager)
      this._origStepChange?.(key, idx, total)
      // Atualizar painel VR
      const meta = this.pumpModel.meta?.[key]
      if (this._panels.stepLbl)  this._panels.stepLbl.text  = `PASSO ${idx+1} / ${total}`
      if (this._panels.stepName) this._panels.stepName.text = meta?.label ?? key
      if (this._panels.stepDesc) this._panels.stepDesc.text = meta?.desc ?? ''
      this._panels.stepPlane?.setEnabled(true)
    }

    this.assembly.onComplete = () => {
      // Chamar callback original (HUDManager)
      this._origComplete?.()
      // Atualizar painel VR
      if (this._panels.stepLbl)  this._panels.stepLbl.text  = 'CONCLUIDO!'
      if (this._panels.stepName) this._panels.stepName.text = 'Bomba montada!'
    }
  }

  setModo(modo) {
    const show = modo === 'guiado' || modo === 'avaliacao'
    this._panels.stepPlane?.setEnabled(show)
  }
}
