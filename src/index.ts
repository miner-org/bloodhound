import type { Bot } from 'mineflayer'
import type { Entity } from 'prismarine-entity'
import type { Item } from 'prismarine-item'

declare module 'mineflayer' {
    interface Bot {
        bloodhound: {
            yawCorrelationEnabled: boolean
        }
    }

    interface BotEvents {
        onCorrelateAttack: (attacker: Entity, victim: Entity, weapon: Item | null) => void
    }
}

interface BotEvent {
    entity: Entity
    time: number
    used: boolean
}

const maxMeleeDist = 6
const maxDeltaTime = 10
const maxDeltaYawPer = 10
const maxAgeCleanup = 20
const maxEventsSizeCleanup = 10

function bloodHound(bot: Bot) {
    const lastHurts: BotEvent[] = []
    const lastAttacks: BotEvent[] = []

    bot.bloodhound = {
        yawCorrelationEnabled: true,
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
            bot.bloodhound.yawCorrelationEnabled === true &&
            testAttackYaw(attack.entity, hurt.entity)
        ) {
            bot.emit('onCorrelateAttack', attack.entity, hurt.entity, weapon)
            lastHurts[hurtIndex].used = true
            lastAttacks[attackIndex].used = true
        } else {
            bot.emit('onCorrelateAttack', attack.entity, hurt.entity, weapon)
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

    function makeEvent(entity: Entity, time: number): BotEvent {
        return { entity, time, used: false }
    }

    // for whatever reason mineflayer doesn't fire the entityHurt event properly anymore
    // so this code is gonna be a workaround for that
    bot._client.on('damage_event', (packet) => {
        const entity = bot.entities[packet.entityId]
        if (entity) bot.emit('entityHurt', entity)
    })

    bot.on('entityHurt', function (entity) {
        const time = new Date().getTime()
        lastHurts.push(makeEvent(entity, time))
        correlateAttacks()
    })

    bot.on('entitySwingArm', function (entity) {
        const time = new Date().getTime()
        lastAttacks.push(makeEvent(entity, time))
        correlateAttacks()
    })
}

export default bloodHound
export { bloodHound }
