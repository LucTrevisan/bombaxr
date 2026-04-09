/**
 * SceneManager.js — Engine, câmera, iluminação e ambiente 360°
 * Método validado pelo teste360.html — StandardMaterial + emissiveTexture
 */
import * as BABYLON from '@babylonjs/core'

export class SceneManager {
  constructor(canvas) {
    this.canvas  = canvas
    this.engine  = null
    this.scene   = null
    this.camera  = null
    this.shadowGenerator = null
  }

  async init() {
    // ── Engine com suporte WebXR nativo ─────────────────────────────────────
    // Verificar suporte WebGL2 (necessário para Quest)
    const gl = this.canvas.getContext('webgl2') ||
               this.canvas.getContext('webgl')
    if (!gl) {
      console.error('WebGL não suportado neste dispositivo')
      throw new Error('WebGL not supported')
    }

    this.engine = new BABYLON.Engine(this.canvas, true, {
      preserveDrawingBuffer: true,
      stencil:               true,
      antialias:             false,
      xrCompatible:          true,   // obrigatório para Quest
      disableWebGL2Support:  false,  // forçar WebGL2 quando disponível
      failIfMajorPerformanceCaveat: false,  // não falhar em dispositivos lentos
    })

    this.engine.setHardwareScalingLevel(1.0)

    // ── Cena ────────────────────────────────────────────────────────────────
    this.scene = new BABYLON.Scene(this.engine)
    // clearColor DEVE ser preto opaco — a esfera 360 cobre tudo por baixo
    this.scene.clearColor = new BABYLON.Color4(0, 0, 0, 1)
    this.scene.fogMode    = BABYLON.Scene.FOGMODE_NONE

    // ── Câmera orbital ───────────────────────────────────────────────────────
    this.camera = new BABYLON.ArcRotateCamera(
      'cam', -Math.PI / 2, Math.PI / 4, 4.0,
      new BABYLON.Vector3(0, 0.5, 0), this.scene
    )
    this.camera.lowerRadiusLimit      = 0.5
    this.camera.upperRadiusLimit      = 12
    this.camera.wheelPrecision        = 60
    this.camera.pinchDeltaPercentage  = 0.001
    this.camera.angularSensibilityX   = 500
    this.camera.angularSensibilityY   = 500
    this.camera.panningSensibility    = 100
    this.camera.multiTouchPanning     = true
    this.camera.multiTouchPanAndZoom  = true
    this.camera.attachControl(this.canvas, true)

    // ── Chão industrial — sempre visível como base ───────────────────────────
    this._setupGround()

    // ── Ambiente 360° — método validado ──────────────────────────────────────
    await this._setup360()

    // ── Iluminação ───────────────────────────────────────────────────────────
    this._setupLighting()

    // ── Grade de chão ────────────────────────────────────────────────────────

    // ── Post-processing ──────────────────────────────────────────────────────
    this._setupPostProcessing()

    // ── Render loop ──────────────────────────────────────────────────────────
    this.engine.runRenderLoop(() => this.scene.render())
    window.addEventListener('resize', () => this.engine.resize())
  }

  _setupGround() {
    // Chão industrial simples — sempre visível, recebe sombra
    const ground = BABYLON.MeshBuilder.CreateGround('industrial_ground', {
      width: 10, height: 10, subdivisions: 4
    }, this.scene)

    const mat = new BABYLON.StandardMaterial('ground_mat', this.scene)
    mat.diffuseColor  = new BABYLON.Color3(0.28, 0.30, 0.33)  // cinza industrial
    mat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05)
    mat.roughness     = 0.9

    ground.material       = mat
    ground.receiveShadows = true
    ground.isPickable     = false
    ground.position.y     = -0.42  // abaixo da bomba

    // Grade sutil — linhas no chão para senso de escala
    const linhas = []
    for (let i = -5; i <= 5; i++) {
      linhas.push([new BABYLON.Vector3(i, -0.419, -5), new BABYLON.Vector3(i, -0.419, 5)])
      linhas.push([new BABYLON.Vector3(-5, -0.419, i), new BABYLON.Vector3(5, -0.419, i)])
    }
    const grade = BABYLON.MeshBuilder.CreateLineSystem('grade_chao', { lines: linhas }, this.scene)
    grade.color     = new BABYLON.Color3(0.35, 0.38, 0.42)
    grade.alpha     = 0.25
    grade.isPickable = false

    this._ground = ground
    console.log('✅ Chão industrial criado')
  }

  async _setup360() {
    const base    = import.meta.env.BASE_URL
    const envFile = base + 'assets/ambiente360.env'
    const jpgFile = base + 'assets/ambiente360.jpg'

    // Tentar .env primeiro (formato nativo Babylon — máxima qualidade)
    // Converter em: https://www.babylonjs.com/tools/ibl/
    // Se não existir, usar JPG como fallback
    const hasEnv = await this._fileExists(envFile)

    if (hasEnv) {
      console.log('🌐 Carregando ambiente .env — alta qualidade')
      await this._setup360ENV(envFile)
    } else {
      console.log('🌐 Carregando ambiente JPG')
      await this._setup360JPG(jpgFile)
    }
  }

  async _fileExists(url) {
    try {
      const r = await fetch(url, { method: 'HEAD' })
      return r.ok
    } catch { return false }
  }

  async _setup360ENV(url) {
    return new Promise((resolve) => {
      try {
        // CubeTexture .env — formato nativo Babylon, máxima qualidade
        const envTex = BABYLON.CubeTexture.CreateFromPrefilteredData(url, this.scene)

        envTex.onLoadObservable?.add(() => {
          this.scene.environmentTexture   = envTex
          this.scene.environmentIntensity = 0.8

          const skybox = this.scene.createDefaultSkybox(envTex, true, 1000, 0.0)
          if (skybox) {
            skybox.isPickable       = false
            skybox.renderingGroupId = 0
            this._sky = skybox
          }

          console.log('✅ ENV carregado — reflexos PBR de alta qualidade')
          resolve()
        })

        // Fallback com timeout
        setTimeout(() => {
          if (!this.scene.environmentTexture) {
            console.warn('⚠️ ENV timeout — usando JPG')
            this._setup360JPG(
              import.meta.env.BASE_URL + 'assets/ambiente360.jpg'
            ).then(resolve)
          }
        }, 15000)

      } catch (e) {
        console.warn('⚠️ ENV falhou:', e.message, '— usando JPG')
        this._setup360JPG(
          import.meta.env.BASE_URL + 'assets/ambiente360.jpg'
        ).then(resolve)
      }
    })
  }

  async _setup360JPG(url) {
    const sphere = BABYLON.MeshBuilder.CreateSphere('sky360', {
      diameter:        1000,
      segments:        64,
      sideOrientation: BABYLON.Mesh.BACKSIDE,
    }, this.scene)

    sphere.isPickable       = false
    sphere.infiniteDistance = true
    sphere.renderingGroupId = 0
    sphere.position         = BABYLON.Vector3.Zero()

    const mat = new BABYLON.StandardMaterial('sky360mat', this.scene)
    mat.disableLighting = true
    mat.backFaceCulling = false
    mat.fogEnabled      = false
    mat.emissiveColor   = new BABYLON.Color3(0.04, 0.06, 0.10)
    sphere.material     = mat
    this._sky           = sphere

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('⚠️ JPG 360° timeout')
        resolve()
      }, 12000)

      const tex = new BABYLON.Texture(
        url, this.scene, false, false,
        BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
        () => {
          clearTimeout(timeout)
          tex.uScale = 1
          tex.vScale = 1
          tex.wrapU  = BABYLON.Texture.WRAP_ADDRESSMODE
          tex.wrapV  = BABYLON.Texture.CLAMP_ADDRESSMODE
          mat.diffuseTexture  = tex
          mat.emissiveTexture = tex
          mat.emissiveColor   = BABYLON.Color3.White()
          console.log('✅ JPG 360° carregado')
          resolve()
        },
        () => { clearTimeout(timeout); resolve() }
      )
    })
  }

  _setupLighting() {
    // Iluminação neutra — preserva cores originais do SolidWorks
    // Inspirado no setup do gltf.report: luz uniforme sem dominância de cor

    // Hemisférica principal — branca pura, simula ambiente estúdio
    const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0,1,0), this.scene)
    hemi.intensity   = 0.85
    hemi.diffuse     = new BABYLON.Color3(1.0, 1.0, 1.0)
    hemi.specular    = new BABYLON.Color3(0.3, 0.3, 0.3)
    hemi.groundColor = new BABYLON.Color3(0.5, 0.5, 0.5)

    // Direcional principal — branca, ângulo de estúdio
    const dir = new BABYLON.DirectionalLight('dir', new BABYLON.Vector3(-1,-2,-0.5), this.scene)
    dir.position  = new BABYLON.Vector3(8, 12, 8)
    dir.intensity = 0.7
    dir.diffuse   = new BABYLON.Color3(1.0, 1.0, 1.0)
    dir.specular  = new BABYLON.Color3(0.8, 0.8, 0.8)

    // Fill light suave — evitar sombras duras
    const fill = new BABYLON.DirectionalLight('fill', new BABYLON.Vector3(1,-0.5,1), this.scene)
    fill.position  = new BABYLON.Vector3(-5, 5, -5)
    fill.intensity = 0.4
    fill.diffuse   = new BABYLON.Color3(1.0, 1.0, 1.0)
    fill.specular  = new BABYLON.Color3(0.0, 0.0, 0.0)

    this.shadowGenerator = new BABYLON.ShadowGenerator(1024, dir)
    this.shadowGenerator.useBlurExponentialShadowMap = true
    this.shadowGenerator.blurKernel = 8
    this.scene._shadowGenerator     = this.shadowGenerator

    // Chão invisível que só recebe sombra
  }



  _setupPostProcessing() {
    // Post-processing leve — compatível com Meta Quest
    try {
      const p = new BABYLON.DefaultRenderingPipeline('pipe', true, this.scene, [this.camera])
      p.bloomEnabled   = false  // bloom desativado — pesado no Quest
      p.imageProcessingEnabled             = true
      p.imageProcessing.contrast           = 1.05
      p.imageProcessing.vignetteEnabled    = false // vinheta desativada
      p.imageProcessing.toneMappingEnabled = false // tonemapping desativado
    } catch (e) { /* não crítico */ }
  }

  // Girar o ambiente (alinhar oficina com a frente da bomba)
  setEnvRotation(deg) {
    const tex = this._skyMat?.diffuseTexture
    if (tex) tex.uOffset = deg / 360
  }

  // ── Trocar foto do ambiente 360° — usado pelo TourManager ─────────────
  async trocarAmbiente360(url) {
    return new Promise((resolve) => {
      const mat = this._skyMat
      if (!mat) { resolve(); return }

      const timeout = setTimeout(resolve, 8000)

      const tex = new BABYLON.Texture(
        url, this.scene, false, false,
        BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
        () => {
          clearTimeout(timeout)
          tex.uScale = 1
          tex.vScale = 1
          tex.wrapU  = BABYLON.Texture.WRAP_ADDRESSMODE
          tex.wrapV  = BABYLON.Texture.CLAMP_ADDRESSMODE

          mat.diffuseTexture?.dispose()
          mat.emissiveTexture?.dispose()

          mat.diffuseTexture  = tex
          mat.emissiveTexture = tex
          mat.emissiveColor   = BABYLON.Color3.White()

          if (this._sky) this._sky.setEnabled(true)

          resolve()
        },
        () => { clearTimeout(timeout); resolve() }
      )
    })
  }
}
