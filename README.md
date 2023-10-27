# bloodhound

Detect entites attacking each other in mineflayer (based on [mineflayer-bloodhound](https://github.com/Nixes/mineflayer-bloodhound))

## Example

```js
const mineflayer = require('mineflayer')
const bloodhound = require('@miner-org/bloodhound')

const bot = mineflayer.createBot({})

bot.loadPlugin(bloodhound)

bot.once('spawn', () => {
    // Reduces false positives with multiple entities in combat
    // But it might produce false negatives
    // Default: true
    bot.bloodhound.yawCorrelation = true

    // Enables detection for projectiles like arrows and tridents
    // If the latency is too high it might impact the reliablity
    // Default: true
    bot.bloodhound.projectileDetection = true
})

bot.on('entityAttack', (victim, attacker, weapon) => {
    const victimName = victim.username ?? victim.displayName
    const attackerName = attacker.username ?? attacker.displayName
    const weaponName = weapon?.displayName

    if (weapon) console.log(`${attackerName} attacked ${victimName} using ${weaponName}!`)
    else console.log(`${attackerName} attacked ${victimName}!`)
})
```