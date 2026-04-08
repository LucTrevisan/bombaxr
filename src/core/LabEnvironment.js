/**
 * LabEnvironment — Fase 2: Ambiente 3D navegável
 * 
 * Fallback automático:
 * - Se laboratorio.glb não existir → não carrega nada, mantém ambiente 360°
 * - Se laboratorio.glb existir → carrega e ativa câmera de caminhada
 */
import * as BABYLON from '@babylonjs/core'

export class LabEnvironment {
  constructor(scene, sceneManager) {
    this.scene        = scene
    this.sceneManager = sceneManager
    this._labMesh     = null
    this._ativo       = false
    this._camAnterior = null  // guarda câmera orbital para restaurar
  }

  // ── Inicializar — verifica se lab GLB existe ──────────────────────────
  async init() {
    const base   = import.meta.env.BASE_URL
    const labUrl = base + 'assets/laboratorio.glb'

    const existe = await this._fileExists(labUrl)

    if (!existe) {
      console.log('🏭 laboratorio.glb não encontrado — modo simulação padrão')
      return false
    }

    try {
      console.log('🏭 Carregando laboratório 3D...')
      await this._carregarLab(labUrl)
      this._ativo = true
      console.log('✅ Laboratório 3D carregado')

      // Adicionar botão de alternância na toolbar
      this._criarBotaoAlternar()

      return true
    } catch (e) {
      console.warn('🏭 Erro ao carregar laboratório:', e.message)
      return false
    }
  }

  get ativo() { return this._ativo }

  // ── Carregar GLB do laboratório ───────────────────────────────────────
  async _carregarLab(url) {
    const result = await BABYLON.SceneLoader.ImportMeshAsync(
      '', url.replace('laboratorio.glb', ''), 'laboratorio.glb', this.scene
    )

    result.meshes.forEach(m => {
      m.isPickable     = false   // lab não é interativo
      m.receiveShadows = true
      m.checkCollisions = true   // colisão para câmera de caminhada
    })

    // Esconder o laboratório inicialmente
    // Só mostra quando aluno entrar no modo tour
    result.meshes.forEach(m => m.setEnabled(false))
    this._labMeshes = result.meshes

    // Esconder esfera 360° quando lab estiver visível
    // (o próprio lab cria o ambiente)
  }

  // ── Alternar entre modo simulação e modo caminhada ────────────────────
  alternarModo() {
    if (this._modoLab) {
      this._entrarModoSimulacao()
    } else {
      this._entrarModoLab()
    }
  }

  _entrarModoLab() {
    this._modoLab = true

    // Mostrar laboratório
    this._labMeshes?.forEach(m => m.setEnabled(true))

    // Esconder esfera 360°
    if (this.sceneManager._sky) {
      this.sceneManager._sky.setEnabled(false)
    }

    // Trocar câmera orbital → câmera de caminhada
    const camAtual = this.sceneManager.camera
    this._camAnterior = camAtual
    camAtual.detachControl()

    const camLab = new BABYLON.UniversalCamera(
      'cam_lab',
      new BABYLON.Vector3(0, 1.7, -3),
      this.scene
    )
    camLab.setTarget(new BABYLON.Vector3(0, 1.7, 0))
    camLab.attachControl(this.sceneManager.canvas, true)
    camLab.speed         = 0.08
    camLab.minZ          = 0.05
    camLab.applyGravity  = true
    camLab.checkCollisions = true
    camLab.ellipsoid     = new BABYLON.Vector3(0.4, 0.85, 0.4)

    // WASD
    camLab.keysUp.push(87)    // W
    camLab.keysDown.push(83)  // S
    camLab.keysLeft.push(65)  // A
    camLab.keysRight.push(68) // D

    this.scene.gravity        = new BABYLON.Vector3(0, -9.81, 0)
    this.scene.collisionsEnabled = true
    this.scene.activeCamera   = camLab
    this._camLab = camLab

    this._atualizarBotao(true)
    console.log('🏭 Modo laboratório ativado — use WASD para caminhar')
  }

  _entrarModoSimulacao() {
    this._modoLab = false

    // Esconder laboratório
    this._labMeshes?.forEach(m => m.setEnabled(false))

    // Mostrar esfera 360°
    if (this.sceneManager._sky) {
      this.sceneManager._sky.setEnabled(true)
    }

    // Restaurar câmera orbital
    this._camLab?.dispose()
    this._camAnterior?.attachControl(this.sceneManager.canvas, true)
    this.scene.activeCamera = this._camAnterior
    this.scene.collisionsEnabled = false

    this._atualizarBotao(false)
    console.log('🔬 Modo simulação restaurado')
  }

  // ── Botão de alternância na toolbar ───────────────────────────────────
  _criarBotaoAlternar() {
    const tb = document.getElementById('toolbar')
    if (!tb) return

    const btn = document.createElement('button')
    btn.id        = 'btn-lab-tour'
    btn.className = 'tool-btn'
    btn.title     = 'Entrar no Laboratório'
    btn.textContent = '🏭'
    btn.addEventListener('click', () => this.alternarModo())
    tb.appendChild(btn)

    this._btnAlternar = btn
  }

  _atualizarBotao(modoLab) {
    if (!this._btnAlternar) return
    this._btnAlternar.textContent = modoLab ? '🔬' : '🏭'
    this._btnAlternar.title = modoLab
      ? 'Voltar para Simulação'
      : 'Entrar no Laboratório'
  }

  async _fileExists(url) {
    try {
      const r = await fetch(url, { method: 'HEAD' })
      return r.ok
    } catch { return false }
  }
}
