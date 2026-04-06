/**
 * SaveManager — Salva/carrega progresso no localStorage
 */
const SAVE_KEY = 'bomba_vr_progresso'

export class SaveManager {
  static salvar(dados) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        ...dados,
        timestamp: Date.now(),
      }))
    } catch (e) { console.warn('Não foi possível salvar progresso') }
  }

  static carregar() {
    try {
      const raw = localStorage.getItem(SAVE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }

  static limpar() {
    localStorage.removeItem(SAVE_KEY)
  }

  static temProgresso() {
    return !!localStorage.getItem(SAVE_KEY)
  }
}
