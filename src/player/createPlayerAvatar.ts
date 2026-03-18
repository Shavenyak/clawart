import * as THREE from 'three'

interface AvatarLimb {
  node: THREE.Object3D
  baseRotationX: number
}

export interface PlayerAvatar {
  group: THREE.Group
  body: THREE.Group
  setName: (name: string) => void
  setFacing: (yaw: number) => void
  setFirstPersonMode: (enabled: boolean) => void
  update: (delta: number, speed: number) => void
}

export function createPlayerAvatar(name: string): PlayerAvatar {
  const group = new THREE.Group()
  group.name = 'player-avatar'

  const body = new THREE.Group()
  group.add(body)

  const whiteMaterial = new THREE.MeshStandardMaterial({
    color: '#fffdfb',
    roughness: 0.9,
    metalness: 0,
  })
  const softMaterial = new THREE.MeshStandardMaterial({
    color: '#f2efe9',
    roughness: 0.94,
    metalness: 0,
  })

  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 18), softMaterial)
  pelvis.position.y = 0.9
  pelvis.castShadow = true
  body.add(pelvis)

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.58, 8, 18), whiteMaterial)
  torso.position.y = 1.34
  torso.castShadow = true
  body.add(torso)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 20), whiteMaterial)
  head.position.y = 1.95
  head.castShadow = true
  body.add(head)

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.11, 12), softMaterial)
  neck.position.y = 1.73
  neck.castShadow = true
  body.add(neck)

  const leftArmPivot = new THREE.Group()
  leftArmPivot.position.set(-0.28, 1.58, 0)
  body.add(leftArmPivot)
  const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.44, 6, 12), whiteMaterial)
  leftArm.position.y = -0.28
  leftArm.castShadow = true
  leftArmPivot.add(leftArm)

  const rightArmPivot = new THREE.Group()
  rightArmPivot.position.set(0.28, 1.58, 0)
  body.add(rightArmPivot)
  const rightArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.44, 6, 12), whiteMaterial)
  rightArm.position.y = -0.28
  rightArm.castShadow = true
  rightArmPivot.add(rightArm)

  const leftLegPivot = new THREE.Group()
  leftLegPivot.position.set(-0.12, 0.82, 0)
  body.add(leftLegPivot)
  const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.56, 6, 12), whiteMaterial)
  leftLeg.position.y = -0.36
  leftLeg.castShadow = true
  leftLegPivot.add(leftLeg)

  const rightLegPivot = new THREE.Group()
  rightLegPivot.position.set(0.12, 0.82, 0)
  body.add(rightLegPivot)
  const rightLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.56, 6, 12), whiteMaterial)
  rightLeg.position.y = -0.36
  rightLeg.castShadow = true
  rightLegPivot.add(rightLeg)

  const label = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createNameLabelTexture(name),
      transparent: true,
      depthWrite: false,
    }),
  )
  label.position.set(0, 2.4, 0)
  label.scale.set(1.8, 0.52, 1)
  group.add(label)

  const limbs: AvatarLimb[] = [
    { node: leftArmPivot, baseRotationX: 0.16 },
    { node: rightArmPivot, baseRotationX: -0.16 },
    { node: leftLegPivot, baseRotationX: -0.12 },
    { node: rightLegPivot, baseRotationX: 0.12 },
  ]

  let stepTime = 0

  return {
    group,
    body,
    setName(nextName: string) {
      const spriteMaterial = label.material as THREE.SpriteMaterial
      spriteMaterial.map?.dispose()
      spriteMaterial.map = createNameLabelTexture(nextName)
      spriteMaterial.needsUpdate = true
    },
    setFacing(yaw: number) {
      body.rotation.y = yaw
    },
    setFirstPersonMode(enabled: boolean) {
      head.visible = !enabled
      neck.visible = !enabled
      label.visible = !enabled
    },
    update(delta: number, speed: number) {
      if (speed > 0.03) {
        stepTime += delta * Math.min(Math.max(speed * 2.3, 1.1), 6.5)
      }

      const walkAmount = Math.min(speed / 2.4, 1)
      const swing = Math.sin(stepTime * 6.2) * 0.52 * walkAmount
      const bounce = Math.abs(Math.sin(stepTime * 6.2)) * 0.045 * walkAmount

      limbs[0].node.rotation.x = THREE.MathUtils.lerp(
        limbs[0].node.rotation.x,
        limbs[0].baseRotationX + swing,
        Math.min(delta * 10, 1),
      )
      limbs[1].node.rotation.x = THREE.MathUtils.lerp(
        limbs[1].node.rotation.x,
        limbs[1].baseRotationX - swing,
        Math.min(delta * 10, 1),
      )
      limbs[2].node.rotation.x = THREE.MathUtils.lerp(
        limbs[2].node.rotation.x,
        limbs[2].baseRotationX - swing * 0.88,
        Math.min(delta * 10, 1),
      )
      limbs[3].node.rotation.x = THREE.MathUtils.lerp(
        limbs[3].node.rotation.x,
        limbs[3].baseRotationX + swing * 0.88,
        Math.min(delta * 10, 1),
      )
      body.position.y = THREE.MathUtils.lerp(body.position.y, bounce, Math.min(delta * 10, 1))
    },
  }
}

function createNameLabelTexture(name: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 144
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Canvas 2D context is required to create a name label.')
  }

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = 'rgba(255, 253, 251, 0.96)'
  roundRect(context, 14, 24, 484, 92, 42)
  context.fill()

  context.strokeStyle = 'rgba(235, 231, 231, 0.95)'
  context.lineWidth = 3
  roundRect(context, 14, 24, 484, 92, 42)
  context.stroke()

  context.fillStyle = '#2b0514'
  context.font = '700 42px "Mixtiles Sans", Arial, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(name, canvas.width / 2, canvas.height / 2 + 2, 430)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.arcTo(x + width, y, x + width, y + height, radius)
  context.arcTo(x + width, y + height, x, y + height, radius)
  context.arcTo(x, y + height, x, y, radius)
  context.arcTo(x, y, x + width, y, radius)
  context.closePath()
}
