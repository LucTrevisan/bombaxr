/**
 * VRUIManager v4 — Design alinhado ao desktop
 * - Cores/tipografia iguais ao HTML (glassmorphism, accent cyan)
 * - Look-at manual em vez de billboardMode (corrige clique nos botões)
 * - Painéis: top bar + modos + toolbar + info + step
 */
import * as BABYLON from '@babylonjs/core'
import * as GUI     from '@babylonjs/gui'

// ── Paleta idêntica ao index.html ──────────────────────────────────────────
const C = {
  bg:       '#060810',
  surface:  '#0c1018',
  surface2: '#111822',
  border:   '#1a2235',
  borderH:  '#253050',
  accent:   '#00c8f0',
  accent2:  '#f06000',
  success:  '#00e87a',
  warn:     '#f0c000',
  danger:   '#ff4060',
  text:     '#d0dce8',
  text2:    '#8899aa',
  dim:      '#506070',
  glass:    'rgba(8,12,20,0.92)',
}

const GRUPO_COR = {
  hidraulico:  C.accent,
  transmissao: C.accent2,
  mancal:      '#A78BFA',
  vedacao:     C.success,
  motor:       C.warn,
  estrutura:   C.dim,
}

export class VRUIManager {
  constructor(scene, assembly, pumpModel) {
    this.scene     = scene
    this.assembly  = assembly
    this.pumpModel = pumpModel
    this._panels   = {}
    this._inVR     = false
    this._modoAtivo = 'visualizacao'
    this._lookObs   = null
  }

  init() {
    this._buildMainPanel()
    this._buildInfoPanel()
    this._buildStepPanel()
    this._buildToolbar()
    this._bindCallbacks()
    this._hideAllVR()
  }

  onEnterVR(xrCamera = null) {
    this._inVR    = true
    this._xrCamera = xrCamera
    this._showAllVR()
    this._repositionPanels()
    this._startLookAt()
  }

  onExitVR() {
    this._inVR = false
    this._xrCamera = null
    this._stopLookAt()
    this._hideAllVR()
  }

  // ══════════════════════════════════════════════════════════════════════
  // PAINEL PRINCIPAL (modos + título) — estilo desktop
  // ══════════════════════════════════════════════════════════════════════
  _buildMainPanel() {
    const plane = BABYLON.MeshBuilder.CreatePlane('vr_main',
      { width: 0.60, height: 0.80 }, this.scene)
    plane.isPickable = true
    plane.renderingGroupId = 1

    const tex = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 600, 800)

    // Fundo glass
    const bg = new GUI.Rectangle()
    bg.background   = C.glass
    bg.cornerRadius = 16
    bg.thickness    = 1
    bg.color        = C.border
    bg.width = '100%'; bg.height = '100%'
    tex.addControl(bg)

    // Top bar
    const topbar = new GUI.Rectangle()
    topbar.height = '80px'
    topbar.width = '100%'
    topbar.thickness = 0
    topbar.background = C.surface
    topbar.cornerRadius = 16
    topbar.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP
    bg.addControl(topbar)

    const senaiBox = new GUI.Rectangle()
    senaiBox.width = '100px'; senaiBox.height = '48px'
    senaiBox.background = '#ffffff'
    senaiBox.cornerRadius = 6; senaiBox.thickness = 0
    senaiBox.left = '16px'
    senaiBox.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT
    topbar.addControl(senaiBox)

    const senaiTxt = new GUI.TextBlock()
    senaiTxt.text = 'SENAI'
    senaiTxt.color = '#000'; senaiTxt.fontSize = 26
    senaiTxt.fontWeight = 'bold'
    senaiBox.addControl(senaiTxt)

    const titleCol = new GUI.StackPanel()
    titleCol.isVertical = true
    titleCol.width = '340px'; titleCol.height = '60px'
    titleCol.left = '130px'
    titleCol.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT
    topbar.addControl(titleCol)

    const unit = new GUI.TextBlock()
    unit.text = 'MECATRÔNICA · VR'
    unit.color = C.dim; unit.fontSize = 14
    unit.height = '18px'
    unit.fontWeight = 'bold'
    unit.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT
    titleCol.addControl(unit)

    const titleT = new GUI.TextBlock()
    titleT.text = 'BOMBA CENTRÍFUGA'
    titleT.color = C.accent; titleT.fontSize = 22
    titleT.height = '26px'
    titleT.fontWeight = 'bold'
    titleT.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT
    titleCol.addControl(titleT)

    // Progress strip
    const progWrap = new GUI.Rectangle()
    progWrap.height = '44px'; progWrap.width = '100%'
    progWrap.top = '82px'
    progWrap.thickness = 0
    progWrap.background = C.surface2
    progWrap.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP
    bg.addControl(progWrap)

    const progLabel = new GUI.TextBlock()
    progLabel.text = 'MONTAGEM'
    progLabel.color = C.dim; progLabel.fontSize = 12
    progLabel.width = '100px'; progLabel.height = '16px'
    progLabel.left = '18px'
    progLabel.fontWeight = 'bold'
    progLabel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT
    progLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT
    progWrap.addControl(progLabel)

    const progTrack = new GUI.Rectangle()
    progTrack.width = '280px'; progTrack.height = '6px'
    progTrack.left = '130px'
    progTrack.thickness = 0
    progTrack.background = C.border
    progTrack.cornerRadius = 3
    progTrack.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT
    progWrap.addControl(progTrack)

    const progBar = new GUI.Rectangle()
    progBar.width = '0%'; progBar.height = '100%'
    progBar.thickness = 0
    progBar.background = C.accent
    progBar.cornerRadius = 3
    progBar.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT
    progTrack.addControl(progBar)

    const progPct = new GUI.TextBlock()
    progPct.text = '0%'
    progPct.color = C.text; progPct.fontSize = 16
    progPct.width = '50px'; progPct.height = '20px'
    progPct.left = '430px'
    progPct.fontWeight = 'bold'
    progPct.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT
    progWrap.addControl(progPct)

    // Content stack
    const stack = new GUI.StackPanel()
    stack.isVertical = true
    stack.width = '92%'
    stack.top = '140px'
    stack.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP
    bg.addControl(stack)

    // Label modos
    const modoLbl = new GUI.TextBlock()
    modoLbl.text = 'MODO DE OPERAÇÃO'
    modoLbl.color = C.dim; modoLbl.fontSize = 13
    modoLbl.height = '20px'
    modoLbl.fontWeight = 'bold'
    modoLbl.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT
    stack.addControl(modoLbl)

    const spacer1 = new GUI.Rectangle()
    spacer1.height = '8px'; spacer1.thickness = 0
    stack.addControl(spacer1)

    // Botões de modo — estilo pill
    const modos = [
      { id: 'visualizacao', label: 'Visualizar' },
      { id: 'livre',        label: 'Livre'      },
      { id: 'guiado',       label: 'Guiado'     },
      { id: 'avaliacao',    label: 'Avaliação'  },
    ]

    modos.forEach(({ id, label }) => {
      const btn = this._mkButton(`vrbtn_${id}`, label, {
        w: '100%', h: '54px',
        bg: id === 'visualizacao' ? C.accent : C.surface2,
        color: id === 'visualizacao' ? C.bg : C.text2,
        fontSize: 22,
        border: C.border,
      })
      btn.onPointerClickObservable.add(() => this._setModoVR(id))
      btn.onPointerUpObservable.add(() => this._setModoVR(id))
      stack.addControl(btn)
      this._panels[`vrbtn_${id}`] = btn
    })

    const spacer2 = new GUI.Rectangle()
    spacer2.height = '12px'; spacer2.thickness = 0
    stack.addControl(spacer2)

    // Divider
    const div = new GUI.Rectangle()
    div.height = '1px'; div.width = '100%'
    div.thickness = 0; div.background = C.border
    stack.addControl(div)

    const spacer3 = new GUI.Rectangle()
    spacer3.height = '12px'; spacer3.thickness = 0
    stack.addControl(spacer3)

    // Label ações
    const acaoLbl = new GUI.TextBlock()
    acaoLbl.text = 'AÇÕES RÁPIDAS'
    acaoLbl.color = C.dim; acaoLbl.fontSize = 13
    acaoLbl.height = '20px'
    acaoLbl.fontWeight = 'bold'
    acaoLbl.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT
    stack.addControl(acaoLbl)

    const spacer4 = new GUI.Rectangle()
    spacer4.height = '6px'; spacer4.thickness = 0
    stack.addControl(spacer4)

    const acoes = [
      { id: 'explodir',  label: 'Explodir',  color: C.accent  },
      { id: 'montar',    label: 'Montar',    color: C.success },
      { id: 'reiniciar', label: 'Reiniciar', color: C.warn    },
    ]

    acoes.forEach(({ id, label, color }) => {
      const btn = this._mkButton(`vrbtn_${id}`, label, {
        w: '100%', h: '48px',
        bg: C.surface2, color, fontSize: 20, border: color,
      })
      const fn = () => {
        if (id === 'explodir')  this.assembly.explodir(true)
        if (id === 'montar')    this.assembly.montar(true)
        if (id === 'reiniciar') this.assembly.reset()
      }
      btn.onPointerClickObservable.add(fn)
      btn.onPointerUpObservable.add(fn)
      stack.addControl(btn)
    })

    this._panels.mainPlane = plane
    this._panels.mainTex   = tex
    this._panels.progBar   = progBar
    this._panels.progPct   = progPct
  }

  // ══════════════════════════════════════════════════════════════════════
  // PAINEL INFO — estilo desktop
  // ══════════════════════════════════════════════════════════════════════
  _buildInfoPanel() {
    const plane = BABYLON.MeshBuilder.CreatePlane('vr_info',
      { width: 0.55, height: 0.70 }, this.scene)
    plane.isPickable = true
    plane.renderingGroupId = 1
    plane.setEnabled(false)

    const tex = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 550, 700)

    const bg = new GUI.Rectangle()
    bg.background   = C.glass
    bg.cornerRadius = 16
    bg.thickness    = 1
    bg.color        = C.border
    bg.width = '100%'; bg.height = '100%'
    tex.addControl(bg)

    // Header com barra lateral colorida
    const header = new GUI.Rectangle()
    header.height = '120px'; header.width = '100%'
    header.thickness = 0; header.background = C.surface
    header.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP
    bg.addControl(header)

    const sidebar = new GUI.Rectangle()
    sidebar.width = '5px'; sidebar.height = '100%'
    sidebar.thickness = 0; sidebar.background = C.accent
    sidebar.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT
    header.addControl(sidebar)

    const hStack = new GUI.StackPanel()
    hStack.isVertical = true
    hStack.width = '90%'; hStack.left = '18px'
    hStack.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT
    header.addControl(hStack)

    const sp0 = new GUI.Rectangle(); sp0.height='14px'; sp0.thickness=0; hStack.addControl(sp0)

    const badge = new GUI.TextBlock()
    badge.text = 'GRUPO'
    badge.color = C.accent; badge.fontSize = 13
    badge.height = '18px'; badge.fontWeight = 'bold'
    badge.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT
    hStack.addControl(badge)

    const nome = new GUI.TextBlock()
    nome.text = '—'
    nome.color = C.text; nome.fontSize = 28
    nome.height = '34px'; nome.fontWeight = 'bold'
    nome.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT
    hStack.addControl(nome)

    const en = new GUI.TextBlock()
    en.text = '—'
    en.color = C.dim; en.fontSize = 15
    en.height = '20px'
    en.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT
    hStack.addControl(en)

    const close = this._mkButton('vr_info_close', '✕', {
      w: '36px', h: '36px',
      bg: C.surface2, color: C.text2, fontSize: 18, border: C.border,
    })
    close.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT
    close.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP
    close.top = '12px'; close.left = '-12px'
    close.onPointerClickObservable.add(() => plane.setEnabled(false))
    close.onPointerUpObservable.add(() => plane.setEnabled(false))
    header.addControl(close)

    // Body
    const body = new GUI.StackPanel()
    body.isVertical = true
    body.width = '92%'
    body.top = '138px'
    body.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP
    bg.addControl(body)

    const descLbl = this._sectionLabel('DESCRIÇÃO')
    body.addControl(descLbl)
    const desc = new GUI.TextBlock()
    desc.text = '—'; desc.color = C.text2; desc.fontSize = 16
    desc.height = '80px'; desc.textWrapping = true; desc.lineSpacing = '4px'
    desc.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT
    body.addControl(desc)

    const funcLbl = this._sectionLabel('FUNÇÃO')
    body.addControl(funcLbl)
    const funcao = new GUI.TextBlock()
    funcao.text = '—'; funcao.color = C.text2; funcao.fontSize = 16
    funcao.height = '60px'; funcao.textWrapping = true; funcao.lineSpacing = '4px'
    funcao.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT
    body.addControl(funcao)

    const tecLbl = this._sectionLabel('DADOS TÉCNICOS')
    body.addControl(tecLbl)

    const material = this._infoRow('Material', '—')
    body.addControl(material.row); this._panels.infoMaterial = material.val

    const norma = this._infoRow('Norma', '—')
    body.addControl(norma.row); this._panels.infoNorma = norma.val

    const ferr = this._infoRow('Ferramenta', '—')
    body.addControl(ferr.row); this._panels.infoFerr = ferr.val

    // Torque highlight
    const torqueBox = new GUI.Rectangle()
    torqueBox.height = '44px'; torqueBox.width = '100%'
    torqueBox.background = 'rgba(240,192,0,0.10)'
    torqueBox.cornerRadius = 6; torqueBox.thickness = 1
    torqueBox.color = C.warn; torqueBox.paddingTop = '6px'
    const torqueText = new GUI.TextBlock()
    torqueText.text = 'TORQUE: —'
    torqueText.color = C.warn; torqueText.fontSize = 18
    torqueText.fontWeight = 'bold'
    torqueBox.addControl(torqueText)
    body.addControl(torqueBox)

    this._panels.infoPlane     = plane
    this._panels.infoBg        = bg
    this._panels.infoSidebar   = sidebar
    this._panels.infoBadge     = badge
    this._panels.infoNome      = nome
    this._panels.infoEn        = en
    this._panels.infoDesc      = desc
    this._panels.infoFuncao    = funcao
    this._panels.infoTorque    = torqueText
    this._panels.infoTorqueBox = torqueBox
  }

  // ══════════════════════════════════════════════════════════════════════
  // PAINEL STEP (guiado/avaliação)
  // ══════════════════════════════════════════════════════════════════════
  _buildStepPanel() {
    const plane = BABYLON.MeshBuilder.CreatePlane('vr_step',
      { width: 0.55, height: 0.30 }, this.scene)
    plane.isPickable = true
    plane.renderingGroupId = 1
    plane.setEnabled(false)

    const tex = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 550, 300)

    const bg = new GUI.Rectangle()
    bg.background = C.glass; bg.cornerRadius = 16
    bg.thickness = 1; bg.color = C.success
    bg.width = '100%'; bg.height = '100%'
    tex.addControl(bg)

    const stack = new GUI.StackPanel()
    stack.isVertical = true
    stack.width = '90%'
    bg.addControl(stack)

    const sp = new GUI.Rectangle(); sp.height='14px'; sp.thickness=0; stack.addControl(sp)

    const stepLbl = new GUI.TextBlock()
    stepLbl.text = 'PASSO 1 / 15'
    stepLbl.color = C.success; stepLbl.fontSize = 14
    stepLbl.height = '18px'; stepLbl.fontWeight = 'bold'
    stack.addControl(stepLbl)

    const stepName = new GUI.TextBlock()
    stepName.text = '—'; stepName.color = C.text
    stepName.fontSize = 22; stepName.height = '28px'
    stepName.fontWeight = 'bold'
    stack.addControl(stepName)

    const stepDesc = new GUI.TextBlock()
    stepDesc.text = 'Selecione e encaixe a peça indicada.'
    stepDesc.color = C.text2; stepDesc.fontSize = 14
    stepDesc.height = '42px'; stepDesc.textWrapping = true
    stack.addControl(stepDesc)

    const next = this._mkButton('vr_next', 'Próximo Passo', {
      w: '100%', h: '44px', bg: C.success, color: C.bg,
      fontSize: 18, border: C.success,
    })
    const advance = () => this.assembly.guidedAdvance()
    next.onPointerClickObservable.add(advance)
    next.onPointerUpObservable.add(advance)
    stack.addControl(next)

    this._panels.stepPlane = plane
    this._panels.stepLbl   = stepLbl
    this._panels.stepName  = stepName
    this._panels.stepDesc  = stepDesc
  }

  // ══════════════════════════════════════════════════════════════════════
  // TOOLBAR — botões rápidos inferiores
  // ══════════════════════════════════════════════════════════════════════
  _buildToolbar() {
    const plane = BABYLON.MeshBuilder.CreatePlane('vr_toolbar',
      { width: 0.50, height: 0.10 }, this.scene)
    plane.isPickable = true
    plane.renderingGroupId = 1

    const tex = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 500, 100)

    const bg = new GUI.Rectangle()
    bg.background = C.glass; bg.cornerRadius = 10
    bg.thickness = 1; bg.color = C.border
    bg.width = '100%'; bg.height = '100%'
    tex.addControl(bg)

    const row = new GUI.StackPanel()
    row.isVertical = false; row.width = '100%'; row.height = '100%'
    bg.addControl(row)

    const tools = [
      { label: '💥', tip: 'Explodir',   fn: () => this.assembly.explodir(true)  },
      { label: '🔩', tip: 'Montar',     fn: () => this.assembly.montar(true)    },
      { label: '↺',  tip: 'Reset',      fn: () => this.assembly.reset()         },
      { label: '🎬', tip: 'Cinemática', fn: () => this._playCinematic()          },
      { label: '💧', tip: 'Fluxo',      fn: () => this._toggleFlow()             },
    ]

    tools.forEach(({ label, fn }) => {
      const btn = GUI.Button.CreateSimpleButton('tb_' + label, label)
      btn.width = '80px'; btn.height = '80px'
      btn.color = C.text; btn.background = 'transparent'
      btn.fontSize = 30; btn.thickness = 0
      btn.isHitTestVisible = true
      btn.isPointerBlocker = true
      btn.onPointerEnterObservable.add(() => btn.background = C.surface2)
      btn.onPointerOutObservable.add(() => btn.background = 'transparent')
      btn.onPointerClickObservable.add(fn)
      btn.onPointerUpObservable.add(fn)
      row.addControl(btn)
    })

    this._panels.toolbarPlane = plane
  }

  // ══════════════════════════════════════════════════════════════════════
  // MOSTRAR INFO NO VR
  // ══════════════════════════════════════════════════════════════════════
  showPartInfoVR(key) {
    if (!this._inVR) return
    const baseKey = key.replace(/_\d+$/, '')
    const meta    = this.pumpModel.meta?.[baseKey] || this.pumpModel.meta?.[key]
    if (!meta) return

    const cor = GRUPO_COR[meta.grupo] || C.accent

    if (this._panels.infoBadge)   { this._panels.infoBadge.text = (meta.grupo || 'componente').toUpperCase(); this._panels.infoBadge.color = cor }
    if (this._panels.infoNome)      this._panels.infoNome.text = meta.label || key
    if (this._panels.infoEn)        this._panels.infoEn.text = meta.en || ''
    if (this._panels.infoDesc)      this._panels.infoDesc.text = meta.desc || '—'
    if (this._panels.infoFuncao)    this._panels.infoFuncao.text = meta.funcao || '—'
    if (this._panels.infoMaterial)  this._panels.infoMaterial.text = meta.material || '—'
    if (this._panels.infoNorma)     this._panels.infoNorma.text = meta.norma || '—'
    if (this._panels.infoFerr)      this._panels.infoFerr.text = meta.ferramenta || '—'
    if (this._panels.infoSidebar)   this._panels.infoSidebar.background = cor

    const temTorque = meta.torque && meta.torque !== '—'
    if (this._panels.infoTorque)    this._panels.infoTorque.text = temTorque ? `TORQUE: ${meta.torque}` : 'Sem especificação de torque'
    if (this._panels.infoTorqueBox) this._panels.infoTorqueBox.isVisible = temTorque

    // Posicionar ao lado direito do painel principal
    const main = this._panels.mainPlane
    if (main) {
      this._panels.infoPlane.position = new BABYLON.Vector3(
        main.position.x + 0.70,
        main.position.y,
        main.position.z
      )
    }
    this._panels.infoPlane.setEnabled(true)
  }

  // ══════════════════════════════════════════════════════════════════════
  // POSICIONAMENTO + LOOK-AT MANUAL
  // ══════════════════════════════════════════════════════════════════════
  _repositionPanels() {
    const cam = this._xrCamera || this.scene.activeCamera
    if (!cam) return
    const fwd  = cam.getForwardRay(1).direction
    const base = cam.position.clone()

    // Main (esquerda)
    if (this._panels.mainPlane) {
      this._panels.mainPlane.position = new BABYLON.Vector3(
        base.x + fwd.x * 1.20 - 0.40,
        base.y - 0.10,
        base.z + fwd.z * 1.20,
      )
    }

    // Step (direita)
    if (this._panels.stepPlane) {
      this._panels.stepPlane.position = new BABYLON.Vector3(
        base.x + fwd.x * 1.20 + 0.40,
        base.y + 0.20,
        base.z + fwd.z * 1.20,
      )
    }

    // Toolbar (baixo centro)
    if (this._panels.toolbarPlane) {
      this._panels.toolbarPlane.position = new BABYLON.Vector3(
        base.x + fwd.x * 1.00,
        base.y - 0.50,
        base.z + fwd.z * 1.00,
      )
    }
  }

  _startLookAt() {
    this._stopLookAt()
    // Orientar painéis para a câmera sem billboardMode (melhora o picking)
    this._lookObs = this.scene.onBeforeRenderObservable.add(() => {
      const cam = this._xrCamera || this.scene.activeCamera
      if (!cam) return
      const camPos = cam.position
      for (const name of ['mainPlane', 'infoPlane', 'stepPlane', 'toolbarPlane']) {
        const p = this._panels[name]
        if (!p || !p.isEnabled()) continue
        // Virar o plano para a câmera no eixo Y
        const dx = camPos.x - p.position.x
        const dz = camPos.z - p.position.z
        p.rotation.y = Math.atan2(dx, dz)
      }
    })
  }

  _stopLookAt() {
    if (this._lookObs) {
      this.scene.onBeforeRenderObservable.remove(this._lookObs)
      this._lookObs = null
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════
  _mkButton(name, label, { w, h, bg, color, fontSize, border }) {
    const btn = GUI.Button.CreateSimpleButton(name, label)
    btn.width = w; btn.height = h
    btn.color = color; btn.background = bg
    btn.fontSize = fontSize
    btn.cornerRadius = 8
    btn.thickness = 1
    btn.paddingBottom = '4px'
    if (border) btn.color = color
    btn.isHitTestVisible = true
    btn.isPointerBlocker = true
    // Hover feedback
    btn.onPointerEnterObservable.add(() => {
      btn._origBg = btn._origBg || btn.background
      btn.background = C.borderH
    })
    btn.onPointerOutObservable.add(() => {
      btn.background = btn._origBg || bg
    })
    if (btn.textBlock) {
      btn.textBlock.fontWeight = 'bold'
      btn.textBlock.fontSize = fontSize
    }
    return btn
  }

  _sectionLabel(text) {
    const lbl = new GUI.TextBlock()
    lbl.text = text
    lbl.color = C.dim; lbl.fontSize = 12
    lbl.height = '18px'; lbl.fontWeight = 'bold'
    lbl.paddingTop = '8px'
    lbl.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT
    return lbl
  }

  _infoRow(key, val) {
    const row = new GUI.Rectangle()
    row.height = '28px'; row.width = '100%'
    row.thickness = 0
    const keyT = new GUI.TextBlock()
    keyT.text = key; keyT.color = C.dim; keyT.fontSize = 14
    keyT.width = '140px'
    keyT.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT
    keyT.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT
    row.addControl(keyT)
    const valT = new GUI.TextBlock()
    valT.text = val; valT.color = C.text; valT.fontSize = 15
    valT.left = '150px'
    valT.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT
    valT.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT
    row.addControl(valT)
    return { row, val: valT }
  }

  _setModoVR(id) {
    this._modoAtivo = id
    this.assembly.setModo(id)
    const modos = ['visualizacao', 'livre', 'guiado', 'avaliacao']
    modos.forEach(m => {
      const btn = this._panels[`vrbtn_${m}`]
      if (!btn) return
      if (m === id) {
        btn.background = C.accent
        btn.color = C.bg
        btn._origBg = C.accent
      } else {
        btn.background = C.surface2
        btn.color = C.text2
        btn._origBg = C.surface2
      }
    })
    const showStep = id === 'guiado' || id === 'avaliacao'
    this._panels.stepPlane?.setEnabled(showStep)
    // Sincronizar botões desktop (se existirem) — sem acoplamento direto
    this.onModoChanged?.(id)
  }

  _playCinematic() {
    const anim = window._app?.xr?.anim || window._app?.anim
    if (!anim || anim.isPlaying) return
    anim.playDisassembly()
  }

  _toggleFlow() {
    const anim = window._app?.xr?.anim || window._app?.anim
    if (!anim) return
    anim._flowParticles ? anim.stopFlow() : anim.startFlow()
  }

  _showAllVR() {
    this._panels.mainPlane?.setEnabled(true)
    this._panels.toolbarPlane?.setEnabled(true)
  }

  _hideAllVR() {
    this._panels.mainPlane?.setEnabled(false)
    this._panels.stepPlane?.setEnabled(false)
    this._panels.infoPlane?.setEnabled(false)
    this._panels.toolbarPlane?.setEnabled(false)
  }

  _bindCallbacks() {
    this._origStepChange = this.assembly.onStepChange
    this._origComplete   = this.assembly.onComplete
    this._origProgress   = this.assembly.onProgress

    this.assembly.onProgress = (data) => {
      this._origProgress?.(data)
      if (this._panels.progBar) this._panels.progBar.width = data.pct + '%'
      if (this._panels.progPct) this._panels.progPct.text  = data.pct + '%'
    }

    this.assembly.onStepChange = (key, idx, total) => {
      this._origStepChange?.(key, idx, total)
      const meta = this.pumpModel.meta?.[key]
      if (this._panels.stepLbl)  this._panels.stepLbl.text  = `PASSO ${idx+1} / ${total}`
      if (this._panels.stepName) this._panels.stepName.text = meta?.label ?? key
      if (this._panels.stepDesc) this._panels.stepDesc.text = meta?.desc ?? ''
      if (this._inVR) this._panels.stepPlane?.setEnabled(true)
    }

    this.assembly.onComplete = () => {
      this._origComplete?.()
      if (this._panels.stepLbl)  this._panels.stepLbl.text  = '✅ CONCLUÍDO!'
      if (this._panels.stepName) this._panels.stepName.text = 'Bomba montada!'
    }
  }
}
