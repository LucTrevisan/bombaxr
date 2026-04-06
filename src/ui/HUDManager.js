/**
 * HUDManager — Interface 2D completa para apresentação à diretoria
 */
import { MONTAGEM_SEQ } from '../utils/constants.js'
import { SaveManager }  from '../utils/SaveManager.js'

const GRUPO_COR = {
  hidraulico:  '#00C8FF',
  transmissao: '#FFB830',
  mancal:      '#A78BFA',
  vedacao:     '#34D399',
  motor:       '#F87171',
  estrutura:   '#94A3B8',
}

const GRUPO_LABEL = {
  hidraulico:  'Hidráulico',
  transmissao: 'Transmissão',
  mancal:      'Mancal',
  vedacao:     'Vedação',
  motor:       'Motor',
  estrutura:   'Estrutura',
}

export class HUDManager {
  constructor(assembly, pumpModel, audio) {
    this.assembly  = assembly
    this.pumpModel = pumpModel
    this.audio     = audio
    this._timer    = null
    this._currentMode = 'visualizacao'
  }

  init() {
    this._bindModeButtons()
    this._bindToolbar()
    this._bindInfoClose()
    this._setupCallbacks()
    this._checkSavedProgress()
  }

  _bindModeButtons() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._switchMode(btn.dataset.mode)
      })
    })
  }

  _switchMode(mode) {
    this._currentMode = mode
    document.querySelectorAll('.mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode)
    })
    clearInterval(this._timer)
    document.getElementById('avaliacao-panel')?.classList.add('hidden')
    document.getElementById('guiado-panel')?.classList.add('hidden')
    if (mode === 'avaliacao') {
      document.getElementById('avaliacao-panel')?.classList.remove('hidden')
      this._startTimer()
    }
    if (mode === 'guiado') {
      document.getElementById('guiado-panel')?.classList.remove('hidden')
    }
    this.assembly.setModo(mode)
    this.audio?.playSelect()
  }

  _startTimer() {
    let s = 0
    this._timer = setInterval(() => {
      s++
      const mm = String(Math.floor(s/60)).padStart(2,'0')
      const ss = String(s%60).padStart(2,'0')
      const el = document.getElementById('timer-display')
      if (el) el.textContent = `${mm}:${ss}`
    }, 1000)
  }

  _bindToolbar() {
    document.getElementById('btn-reset')?.addEventListener('click', () => {
      this.assembly.reset(); this.audio?.playReset()
      if (this._currentMode === 'avaliacao') {
        clearInterval(this._timer)
        const el = document.getElementById('timer-display')
        if (el) el.textContent = '00:00'
        this._startTimer()
      }
    })
    document.getElementById('btn-explode')?.addEventListener('click', () => {
      this.assembly.explodir(true); this.audio?.playSelect()
    })
    document.getElementById('btn-assemble')?.addEventListener('click', () => {
      this.assembly.montar(true); this.audio?.playSelect()
    })
    document.getElementById('btn-mute')?.addEventListener('click', () => {
      const muted = this.audio?.toggleMute()
      const btn = document.getElementById('btn-mute')
      if (btn) btn.textContent = muted ? '🔇' : '🔊'
    })
    document.getElementById('btn-save')?.addEventListener('click', () => {
      SaveManager.salvar({ modo: this._currentMode, montado: [...this.assembly.montado], score: this.assembly.score })
      this._toast('✅ Progresso salvo!', 'success')
    })
    document.getElementById('btn-hint')?.addEventListener('click', () => {
      this._showHint()
    })
    document.getElementById('btn-next-step')?.addEventListener('click', () => {
      this.assembly.guidedAdvance(); this.audio?.playSelect()
    })
  }

  _bindInfoClose() {
    document.getElementById('info-close')?.addEventListener('click', () => {
      document.getElementById('info-panel')?.classList.add('hidden')
    })
  }

  _setupCallbacks() {
    this.assembly.onProgress = ({ montado, total, pct, score, erros }) => {
      const bar    = document.getElementById('progress-bar')
      const pctEl  = document.getElementById('progress-pct')
      const scoreEl = document.getElementById('score-display')
      const errosEl = document.getElementById('erros-display')
      if (bar)    bar.style.width = pct + '%'
      if (pctEl)  pctEl.textContent = pct + '%'
      if (scoreEl) scoreEl.textContent = String(score).padStart(4,'0')
      if (errosEl) errosEl.textContent = erros
    }

    this.assembly.onStepChange = (key, idx, total) => {
      const meta   = this._getMeta(key)
      const stepEl = document.getElementById('step-label')
      const nameEl = document.getElementById('step-name')
      const descEl = document.getElementById('step-desc')
      if (stepEl) stepEl.textContent = `Passo ${idx+1} / ${total}`
      if (nameEl) nameEl.textContent = meta?.label ?? key
      if (descEl) descEl.textContent = meta?.desc ?? ''
      this._toast(`📍 ${meta?.label ?? key}`, 'info')
    }

    this.assembly.onSnap = (key) => {
      const meta = this._getMeta(key)
      this._toast(`✅ ${meta?.label ?? key} encaixado!`, 'success')
      this.audio?.playSnap()
    }

    this.assembly.onErro = (key) => {
      const meta = this._getMeta(key)
      this._toast(`❌ Posição incorreta para ${meta?.label ?? key}`, 'error')
      this.audio?.playError()
    }

    this.assembly.onComplete = () => {
      clearInterval(this._timer)
      this.audio?.playComplete()
      const tempo = this.assembly.getTempo()
      const bonus = Math.max(0, 300 - tempo) * 2
      const total = this.assembly.score + bonus
      this._showResult(total, tempo, this.assembly.erros)
      SaveManager.limpar()
    }
  }

  // ── Painel de informações da peça — redesenhado para impressionar ─────────
  showPartInfo(key) {
    const baseKey = key.replace(/_\d+$/, '')
    // Tentar todas as variantes possíveis da chave
    const meta = this._getMeta(key)
      || this._getMeta(baseKey)
      || this._getMeta(baseKey.replace('pump_', ''))
    if (!meta) {
      console.warn('Meta não encontrada para:', key, baseKey)
      return
    }

    const panel = document.getElementById('info-panel')
    if (!panel) return

    const cor   = GRUPO_COR[meta.grupo]   || '#00C8FF'
    const grupo = GRUPO_LABEL[meta.grupo] || meta.grupo

    // Badge de grupo
    const badge = document.getElementById('info-badge')
    if (badge) {
      badge.textContent   = grupo
      badge.style.background = cor + '22'
      badge.style.color      = cor
      badge.style.borderColor = cor + '66'
    }

    // Nome e código EN
    const nome = document.getElementById('info-nome')
    const en   = document.getElementById('info-en')
    if (nome) { nome.textContent = meta.label; nome.style.color = cor }
    if (en)   en.textContent = meta.en

    // Indicador de grupo (barra lateral)
    const sidebar = document.getElementById('info-sidebar')
    if (sidebar) sidebar.style.background = cor

    // Campos técnicos
    const set = (id, val) => {
      const el = document.getElementById(id)
      if (el) el.textContent = val || '—'
    }
    set('info-desc',       meta.desc)
    set('info-funcao',     meta.funcao)
    set('info-material',   meta.material)
    set('info-norma',      meta.norma)
    set('info-torque',     meta.torque !== '—' ? meta.torque : '—')
    set('info-ferramenta', meta.ferramenta)
    set('info-intervalo',  meta.intervalo)

    // Destaque de torque se tiver valor
    const torqueRow = document.getElementById('info-torque-row')
    if (torqueRow) {
      torqueRow.style.display = (meta.torque && meta.torque !== '—') ? 'flex' : 'none'
    }

    panel.classList.remove('hidden')
  }

  _getMeta(key) {
    return this.pumpModel.meta?.[key]
  }

  _showHint() {
    const key  = this.assembly.getNextExpected()
    const meta = this._getMeta(key)
    if (!meta) { this._toast('Nenhuma dica disponível neste modo', 'info'); return }
    this._toast(`💡 Próxima peça: ${meta.label}`, 'hint', 3500)
  }

  _showResult(score, tempo, erros) {
    const overlay = document.getElementById('result-overlay')
    if (!overlay) return
    const mm = String(Math.floor(tempo/60)).padStart(2,'0')
    const ss = String(tempo%60).padStart(2,'0')
    document.getElementById('result-score').textContent = score
    document.getElementById('result-time').textContent  = `${mm}:${ss}`
    document.getElementById('result-erros').textContent = erros
    overlay.classList.remove('hidden')
    document.getElementById('btn-resultado-fechar')?.addEventListener('click', () => {
      overlay.classList.add('hidden')
      this._switchMode('visualizacao')
    }, { once: true })
  }

  _toast(msg, tipo='info', dur=2400) {
    const toast = document.getElementById('toast')
    if (!toast) return
    toast.textContent = msg
    toast.className   = `toast toast-${tipo} visible`
    clearTimeout(this._toastTimer)
    this._toastTimer = setTimeout(() => toast.classList.remove('visible'), dur)
  }

  _checkSavedProgress() {
    if (SaveManager.temProgresso()) {
      this._toast('💾 Progresso salvo encontrado', 'hint', 4000)
    }
  }
}
