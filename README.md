# bloodhound

Detect entites attacking each other in mineflayer (based on [mineflayer-bloodhound](https://github.com/Nixes/mineflayer-bloodhound))

## Example

```js
const mineflayer = require('mineflayer')
const bloodhound = require('@miner-org/bloodhound')

const bot = createBot({/*bot options*/})

bot.loadPlugin(bloodhound)

bot.on('entityAttack', (victim, attacker, weapon) => {
    const victimName = victim.username ?? victim.displayName
    const attackerName = attacker.username ?? attacker.displayName
    const weaponName = weapon.displayName

    if (weapon) console.log(`${attackerName} attacked ${victimName} using ${weaponName}!`)
    else console.log(`${attackerName} attacked ${victimName}!`)
})
```