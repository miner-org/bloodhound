import type { Bot } from 'mineflayer'
import type { Entity } from 'prismarine-entity'
import type { Item } from 'prismarine-item'

declare module 'mineflayer' {
    interface Bot {
        bloodhound: {
            yawCorrelation: boolean
            projectileDetection: boolean
        }
    }

    interface BotEvents {
        entityAttack: (attacker: Entity, victim: Entity, weapon: Item | null) => void
    }
}

interface BotEvent {
    entity: Entity
    time: number
    used: boolean
}

interface ProjectileInfo {
    attacker: Entity
    lastUpdate: number
    weapon: Item | null
}

const maxMeleeDist = 6
const maxDeltaTime = 10
const maxDeltaYawPer = 10
const maxAgeCleanup = 20
const maxEventsSizeCleanup = 10

function bloodhound(bot: Bot) {
    const lastHurts: BotEvent[] = []
    const lastAttacks: BotEvent[] = []
    const shotProjectiles: Map<number, ProjectileInfo> = new Map()

    let damageEventTriggered = false
    let hurtEntity: Entity | null = null

    bot.bloodhound = {
        yawCorrelation: true,
        projectileDetection: true
    }

    function calculateAttackYaw(attacker: Entity, victim: Entity) {
        const zDiff = victim.position.z - attacker.position.z
        const xDiff = victim.position.x - attacker.position.x

        let yaw = Math.atan2(zDiff, -xDiff)

        yaw += Math.PI / 2

        if (yaw < 0) yaw += 2 * Math.PI

        return yaw
    }

    function testAttackYaw(attacker: Entity, victim: Entity) {
        const attackYaw = calculateAttackYaw(attacker, victim)
        const deltaYaw = attackYaw - attacker.yaw
        const deltaAttackYawPer = Math.abs((deltaYaw / (2 * Math.PI)) * 100)

        return deltaAttackYawPer < maxDeltaYawPer
    }

    function cleanupEvents(events: BotEvent[]) {
        // Calculate the minimum time (in milliseconds) for events to be considered for cleanup
        const minTime = new Date().getTime() - maxAgeCleanup * 1000

        for (let i = events.length - 1; i >= 0; i--) {
            if (events[i].time < minTime) {
                events.splice(i, 1)
            }
        }
    }

    function cleanUsedEvents(events: BotEvent[]) {
        for (let i = events.length - 1; i >= 0; i--) {
            if (events[i].used) {
                events.splice(i, 1)
            }
        }
    }

    function correlateAttack(hurtIndex: number, attackIndex: number) {
        const hurt: BotEvent = lastHurts[hurtIndex]
        const attack: BotEvent = lastAttacks[attackIndex]
        const deltaTime = Math.abs(hurt.time - attack.time)

        if (deltaTime > maxDeltaTime) return

        const meleeDist = hurt.entity.position.distanceTo(attack.entity.position)

        if (meleeDist > maxMeleeDist) return

        const weapon: Item = attack.entity.heldItem

        if (
            bot.bloodhound.yawCorrelation === true &&
            testAttackYaw(attack.entity, hurt.entity)
        ) {
            bot.emit('entityAttack', hurt.entity, attack.entity, weapon)
            lastHurts[hurtIndex].used = true
            lastAttacks[attackIndex].used = true
        } else {
            bot.emit('entityAttack', hurt.entity, attack.entity, weapon)
            lastHurts[hurtIndex].used = true
            lastAttacks[attackIndex].used = true
        }
    }

    function correlateAttacks() {
        if (lastHurts.length > maxEventsSizeCleanup) cleanupEvents(lastHurts)
        if (lastAttacks.length > maxEventsSizeCleanup) cleanupEvents(lastAttacks)
        if (lastHurts.length === 0 || lastAttacks.length === 0) return

        for (let hurtIndex = 0; hurtIndex < lastHurts.length; hurtIndex++) {
            if (lastHurts[hurtIndex].used) continue

            for (let attackIndex = 0; attackIndex < lastAttacks.length; attackIndex++) {
                if (lastAttacks[attackIndex].used) continue

                correlateAttack(hurtIndex, attackIndex)
            }
        }

        cleanUsedEvents(lastHurts)
        cleanUsedEvents(lastAttacks)
    }

    function associateProjectile(entity: Entity) {
        const nearestEntities = Object.values(bot.entities)
            .filter((e) => e.type === 'player' || e.type === 'mob')
            .sort((a, b) => {
                const distanceA = a.position.distanceTo(entity.position)
                const distanceB = b.position.distanceTo(entity.position)

                return distanceA - distanceB
            })

        if (nearestEntities.length === 0) return

        shotProjectiles.set(entity.id, {
            attacker: nearestEntities[0],
            weapon: nearestEntities[0].heldItem,
            lastUpdate: Date.now()
        })
    }

    function updateProjectile(entity: Entity) {
        const projectile = shotProjectiles.get(entity.id)

        if (!projectile) return

        const timeSinceLastUpdate = Date.now() - projectile.lastUpdate

        if (timeSinceLastUpdate > 600) {
            shotProjectiles.delete(entity.id)
            return
        }

        shotProjectiles.set(entity.id, {
            attacker: projectile.attacker,
            weapon: projectile.weapon,
            lastUpdate: Date.now()
        })
    }

    function detectShooter(hurtEntity: Entity, entity: Entity) {
        const distance = hurtEntity.position.distanceTo(entity.position)

        if (entity.type !== 'projectile' || distance > 3.5) return

        const projectile = shotProjectiles.get(entity.id)

        if (!projectile) return

        bot.emit('entityAttack', hurtEntity, projectile.attacker, projectile.weapon)
        shotProjectiles.delete(entity.id)
    }

    function detectTrident(hurtEntity: Entity) {
        // check if there is a projectile nearby and sort them by distance
        const nearbyProjectiles = Object.values(bot.entities)
            .filter((entity) => entity.type === 'projectile')
            .filter((entity) => entity.position.distanceTo(hurtEntity.position) < 3.5)
            .sort((a, b) => {
                const distanceA = a.position.distanceTo(hurtEntity.position)
                const distanceB = b.position.distanceTo(hurtEntity.position)

                return distanceA - distanceB
            })

        if (nearbyProjectiles.length === 0) return

        const projectileEntity = nearbyProjectiles[0]
        const projectile = shotProjectiles.get(projectileEntity.id)

        if (!projectile) return

        bot.emit('entityAttack', hurtEntity, projectile.attacker, projectile.weapon)
        shotProjectiles.delete(projectileEntity.id)
    }

    function makeEvent(entity: Entity, time: number): BotEvent {
        return { entity, time, used: false }
    }

    // for whatever reason mineflayer doesn't fire the entityHurt event properly anymore
    // so this code is gonna be a workaround for that
    bot._client.on('damage_event', (packet) => {
        const entity = bot.entities[packet.entityId]
        if (entity) bot.emit('entityHurt', entity)
    })

    bot.on('entityGone', (entity) => {
        if (!bot.bloodhound.projectileDetection) return
        else if (entity.type !== 'projectile') return

        if (damageEventTriggered && hurtEntity) void detectShooter(hurtEntity, entity)
    })

    bot.on('entityHurt', function (entity) {
        const time = Date.now()

        lastHurts.push(makeEvent(entity, time))

        void correlateAttacks()

        if (bot.bloodhound.projectileDetection) void detectTrident(entity)

        hurtEntity = entity
        damageEventTriggered = true

        setTimeout(() => {
            hurtEntity = null
            damageEventTriggered = false
        }, 100)
    })

    bot.on('entitySwingArm', function (entity) {
        const time = Date.now()

        lastAttacks.push(makeEvent(entity, time))

        void correlateAttacks()
    })

    bot.on('entitySpawn', (entity) => {
        if (!bot.bloodhound.projectileDetection) return
        else if (entity.type !== 'projectile') return

        void associateProjectile(entity)
    })

    bot.on('entityMoved', (entity) => {
        if (!bot.bloodhound.projectileDetection) return
        else if (entity.type !== 'projectile') return

        void updateProjectile(entity)
    })
}

export default bloodhound
export { bloodhound }
