import Discord, { MessageEmbed } from 'discord.js';
import fetch from 'node-fetch';
import { config } from 'dotenv';
import fs from 'fs';

config();

const client = new Discord.Client({intents: ["GUILDS", "GUILD_MESSAGES"]});

const etherscanKey = process.env.ETHERSCAN_KEY;
const discordAuth = process.env.DISCORD_TOKEN;
const ethAddress = process.env.ETH_ADDRESS;

// filepaths for specific use-case data access [editable]
const filePaths = {
    infoEmbed: './infoEmbed.json',
    addressDictionary: './addressDictionary.json'
};
// channel to display stats [editable]
const statsChannelId = '974167845200076820';

// number of hours between stats refreshes [editable]
const updateTime = 1;

// main object for all stats [don't edit]
let stats;

// tracker for last known rev $/100mh [don't edit]
let lastKnownProfit = 0;

// Generates both maps for alias/address conversion
const addressToAlias = new Map();
const dict = JSON.parse(fs.readFileSync(filePaths.addressDictionary).toString());
if (!dict) throw err;
for (const [key, value] of Object.entries(dict)) {
    addressToAlias.set(key.toLowerCase(), value);
}
const aliasToAddress = new Map();
for (const key of addressToAlias.keys()) {
    const value = addressToAlias.get(key);
    aliasToAddress.set(value, key);
}

// stats updater
async function updateStats() {
    const   { hiveStats, etherscanStats, txRes, wtmRankings, btcStats, wtmAllCoins } = await getStats();
    stats = { hiveStats, etherscanStats, txRes, wtmRankings, btcStats, wtmAllCoins };
    let profMetric = (await client.channels.fetch(statsChannelId).catch((err) => {
        console.log('Failed to find channel');
	}));
    const ethStat = stats.hiveStats.stats.ETH;
    const coins = stats.wtmRankings.coins;
    if (profMetric && ethStat && coins) {
        let currentProfit = Math.round(ethStat.meanExpectedReward24H * 100 * coins['Ethereum'].exchange_rate * stats.btcStats.exchange_rate) / 100;
        profMetric.setName('$/100mh: ' + currentProfit + (lastKnownProfit >= currentProfit ? ' 📉' : ' 📈')).catch((err) => {
            console.log('Failed to set profitability metric');
		});
        lastKnownProfit = currentProfit;
    }
    else {
        console.log('Stats not valid');
    }
}

// initial setup on bot start
client.on("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);
    client.user.setActivity('--help' );
    updateStats();
    const apiInterval = setInterval(updateStats, (updateTime*1000*3600));
    // const dailyExpected = hiveStats.stats.ETH.meanExpectedReward24H;
    // const ethusd = etherscanStats.result.ethusd;
    // const txList = txRes.result;
});

// message detection
client.on("messageCreate", async (msg) => {
    if (!msg.author.bot && msg.content.startsWith('--')) {
        const text = msg.content;
        if (text.startsWith('--coins')) {
            if (text === '--coins top') {
                //msg.reply(getTopCoins());
                msg.reply({ embeds: [getTopCoins()] });
            } else if (text === '--coins all') {
                msg.reply(getAllCoins());
            } else if (text === '--coins count') {
                msg.reply('' + Object.keys(stats.wtmAllCoins.coins).length);
            } else if (text.split(' ').length > 1) {
                msg.reply(getCoinStats(text.split(' ').slice(1).join(' ')));
            } else {
                msg.reply('```Proper Usage of --coins\n--coins all\n--coins count\n--coins <name>\n--coins top```');
            }
        } else if (text.startsWith('--ping')) {
            msg.reply('pong');
        } else if (text.startsWith('--info')) {
            msg.channel.send({embeds: [getInfoEmbed()]});
        } else if (text.startsWith('--help') || text === '--') {
            msg.reply({ embeds: [getHelpPage()] });
        } else if (text.startsWith('--tx')) {
            if (text === '--tx list' || text === '--tx') {
                if (stats && stats.txRes) {
                    msg.reply('--tx [0, ' + (stats.txRes.result.length - 1) + ']');
                }
                else {
                    console.log('Failed to fetch stats.txRes');
                }
            } else {
                const prop = text.split(' ')[1];
                const idx = Number(prop.split('.')[0]);
                const props = prop.split('.').slice(1).join('.');
                if (Number.isNaN(idx)) {
                    msg.reply('```Proper Usage of --tx\n--tx list\n--tx <index>\n--tx <index>.<property>```');
                } else {
                    const reformatted = reformatTxRecord(stats.txRes.result[idx]);
                    const result = resolveNestedProp(reformatted, props);
                    if (!result) {
                        msg.reply(JSON.stringify(reformatted, null, 4));
                    } else if (typeof result === 'object') {
                        msg.reply(JSON.stringify(result, null, 4));
                    } else {
                        msg.reply(result);
                    }
                }
            }
        } else if (text.startsWith('--address')) {
            if (text === '--address') {
                msg.reply('```Proper Usage of --address\n--address list\n--address <person>```');
                return;
            } else if (text === '--address list') {
                msg.reply({ embeds: [getAddressPage()] });
            } else {
                const name = text.split(' ').slice(1).join(' ');
                let address = aliasToAddress.get(name);
                if (address) {
                    msg.reply('`' + name + ": " + address + '`');
                    return;
                }
                address = aliasToAddress.get(capitalize(name));
                if (address) {
                    msg.reply('`' + capitalize(name) + ": " + address + '`');
                    return;
                }
                msg.reply('`Invalid Syntax`\n```Proper Usage of --address\n--address list\n--address <person>```');
            }
        } else if (text.startsWith('--revenue')) {
            if (text.split(" ").length == 2) {
                const mh = Number(text.split(" ")[1]);
                if (!Number.isNaN(mh) && stats && stats.hiveStats && stats.wtmRankings) {
                    const stat = stats.hiveStats.stats.ETH;
                    const coins = stats.wtmRankings.coins;
                    delete stat.exchangeRates;
                    msg.reply('```Expected 24h ETH Revenue: ' + Math.round(stat.meanExpectedReward24H * mh*100) / 10000 + '\nExpected 24h USD Revenue: $' + Math.round(stat.meanExpectedReward24H * mh * coins['Ethereum'].exchange_rate * stats.btcStats.exchange_rate) / 100 + '```');
                    return;
                }
                else {
                    console.log('Failed to fetch stats.hiveStats or stats.wtmRankings')
                }
            }
            msg.reply('```Proper Usage of --revenue\n--revenue <mh>```');
        }
    }
});

// gets custom info embed specified in filePaths.infoEmbed
function getInfoEmbed() {
    const embedData = JSON.parse(fs.readFileSync(filePaths.infoEmbed).toString());
    if (!embedData) {
        return new MessageEmbed({
            title: 'error',
            description: 'failed to read file'
        });
    }
    const embed = new MessageEmbed(embedData);
    if (embed.timestamp) embed.setTimestamp();
    return embed;
}

// gets command help page (outdated)
function getHelpPage() {
    const embed = new MessageEmbed()
    .setColor('#0099ff')
    .setTitle('Help Page')
    .setAuthor(client.user.tag.split('#')[0], 'https://imgur.com/6WII2qM.png', '')
    .setThumbnail('https://imgur.com/6WII2qM.png')
    .addFields(
        { name: 'Command', value: '--address\n--coins\n--help\n--ping\n--revenue\n--tx', inline: true },
        { name: 'Description', value: 'Member crypto address lookup\nview details about various cryptos\nview all commands\ntest the bot\nview projected revenue from hashrate\nview transaction details', inline: true },
        )
        .setTimestamp()
        .setFooter(client.user.tag, 'https://imgur.com/6WII2qM.png');
        return embed;
}

// gets addresses dictionary as embed
function getAddressPage() {
    let names = '';
    let addresses = '';
    for (const key of aliasToAddress.keys()) {
        names += key + '\n';
        addresses += aliasToAddress.get(key) + '\n';
    }
    const embed = new MessageEmbed()
    .setColor('#0099ff')
    .setTitle('Address Page')
    .setAuthor(client.user.tag.split('#')[0], 'https://imgur.com/6WII2qM.png', '')
    .addFields(
        { name: 'Name', value: `${names}`, inline: true },
        { name: 'Address', value: `${addresses}`, inline: true },
    )
    .setTimestamp()
    .setFooter(client.user.tag, 'https://imgur.com/6WII2qM.png');
    return embed;
}
// capitalize first letter of str
function capitalize(str) {
    return str.toLowerCase().split(' ').map((substr) => substr.slice(0, 1).toUpperCase() + substr.slice(1)).join(' ');
}
// converts address to alias
function convertAlias(str) {
    if (str.startsWith('0x')) {
        return addressToAlias.has(str) ? addressToAlias.get(str) : str;
    } else {
        return aliasToAddress.has(str) ? aliasToAddress.get(str) : str;
    }
}
// gets mining stats on coin
function getCoinStats(coinName) {
    if (!stats || !stats.wtmRankings) {
        console.log('Failed to get stats.wtmRankings')
        return;
    }
    const name = coinName.toLowerCase();
    const coins = stats.wtmRankings.coins;
    const keys = Object.keys(coins);
    for (const key of keys) {
        const keyName = key.toLowerCase();
        const keyTag = coins[key].tag.toLowerCase();
        if (keyName === name || keyTag === name) {
            return '' + Math.round(coins[key].exchange_rate * stats.btcStats.exchange_rate * 100) / 100;
        }
    }
    return 'No coin found with name \"' + coinName + '\"';
}
// displays embed of most profitable gpu minable coins (excludes nicehash)
function getTopCoins() {
    if (!stats || !stats.wtmRankings) {
        console.log('Failed to get stats.wtmRankings')
        return;
    }
    let message = "```# | Name | Tag | Rev/24h | Rev/USD\n";
    const coins = stats.wtmRankings.coins;
    const keys = Object.keys(coins);
    let nums = '', names = '', tags = '', rev24 = '', revUSD = '';
    
    let idx = 0;
    if (keys.length >= 10) {
        for (let i = 1; i <= 10; i++) {
            nums += i + '\n';
            while (keys[idx].startsWith('Nicehash')) {
                idx++;
            }
            names += keys[idx] + '\n';
            tags += coins[keys[idx]].tag + '\n';
            rev24 += coins[keys[idx]].estimated_rewards24 + '\n';
            revUSD += Math.round(coins[keys[idx]].btc_revenue24 * stats.btcStats.exchange_rate * 100) / 100 + "\n";
            idx++;
        }
    } else {
        message = 'Fetch Error';
    }


    const embed = new MessageEmbed()
    .setColor('#0099ff')
    .setTitle('Top Coins Page')
    .setAuthor(client.user.tag.split('#')[0], 'https://imgur.com/6WII2qM.png', '')
    .addFields(
        { name: '#', value: `${nums}`, inline: true },
        { name: 'Tag', value: `${tags}`, inline: true },
        { name: 'Name', value: `${names}`, inline: true },
        { name: 'Rev/24h', value: `${rev24}`, inline: true },
        { name: 'Rev/USD', value: `${revUSD}`, inline: true },
        )
        .setTimestamp()
        .setFooter(client.user.tag, 'https://imgur.com/6WII2qM.png');
        return embed;
}

// modifies infoming json of txn record to a better format
function reformatTxRecord(txn) {
    const modifiedTxn = { ...txn };
    const removeProperties = [  'isError', 'input', 'contractAddress', 'gas', 'gasPrice', 'input', 'transactionIndex', 
    'txreceipt_status', 'gasUsed', 'nonce', 'hash', 'blockHash', 'confirmations'];
    for (const property of removeProperties) {
        delete modifiedTxn[property];
    }
    modifiedTxn.value = "" + parseInt(modifiedTxn.value) * 0.000000000000000001;
    const date = new Date(Number(modifiedTxn.timeStamp) * 1000);
    modifiedTxn.timeStamp = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    modifiedTxn.to = convertAlias(modifiedTxn.to);
    modifiedTxn.from = convertAlias(modifiedTxn.from);
    return modifiedTxn;
}
// handles nesting props in --tx command
function resolveNestedProp(obj, prop) {
    const props = prop.split('.');
    const thisProp = props.shift();
    
    if (props.length === 0) {
        return obj[thisProp];
    } else {
        return thisProp in obj ? resolveNestedProp(obj[thisProp], props.join('.')) : null;
    }
}
// gets a list of all gpu minable coins tracked on whattomine.com
function getAllCoins() {
    let message = '';
    const keys = Object.keys(stats.wtmAllCoins.coins);
    if (keys) {
        for (const key of keys) {
            message += (stats.wtmAllCoins.coins[key].tag + '\n');
        }
    } else {
        message = 'Fetch Error';
    }
    return message;
}
// updates stats from hiveon, etherscan, whattomine
async function getStats() {

    // fetches worker data from pool
    const hiveStats = await fetch("https://hiveon.net/api/v1/stats/pool/").then((res) => {
        return res.json();
    });
    // fetches current ethereum price
    const etherscanStats = await fetch("https://api.etherscan.io/api?module=stats&action=ethprice&apikey=" + etherscanKey)
    .then(res => res.json());

    // fetches transaction list for eth address
    const txRes = await fetch("https://api.etherscan.io/api?module=account&action=txlist&address=" + ethAddress +
    "&startblock=12000000&endblock=99999999&page=1&offset=200&sort=asc&apikey=" + etherscanKey)
    .then(res => res.json());

    // fetches the top coins in whattomine
    const wtmRankings = await fetch("https://whattomine.com/coins.json?eth=true&factor%5Beth_hr%5D=91.5&factor%5Beth_p%5D=230.0&e4g=true&factor%5Be4g_hr%5D=91.5&factor%5Be4g_p%5D=230.0&zh=true&factor%5Bzh_hr%5D=134.0&factor%5Bzh_p%5D=250.0&cnh=true&factor%5Bcnh_hr%5D=2400.0&factor%5Bcnh_p%5D=250.0&cng=true&factor%5Bcng_hr%5D=3700.0&factor%5Bcng_p%5D=250.0&cnr=true&factor%5Bcnr_hr%5D=0.0&factor%5Bcnr_p%5D=0.0&cnf=true&factor%5Bcnf_hr%5D=4100.0&factor%5Bcnf_p%5D=250.0&eqa=true&factor%5Beqa_hr%5D=470.0&factor%5Beqa_p%5D=250.0&cc=true&factor%5Bcc_hr%5D=14.2&factor%5Bcc_p%5D=250.0&cr29=true&factor%5Bcr29_hr%5D=14.3&factor%5Bcr29_p%5D=250.0&ct31=true&factor%5Bct31_hr%5D=2.3&factor%5Bct31_p%5D=250.0&ct32=true&factor%5Bct32_hr%5D=0.8&factor%5Bct32_p%5D=250.0&eqb=true&factor%5Beqb_hr%5D=46.5&factor%5Beqb_p%5D=250.0&rmx=true&factor%5Brmx_hr%5D=1500.0&factor%5Brmx_p%5D=250.0&ns=true&factor%5Bns_hr%5D=0.0&factor%5Bns_p%5D=0.0&al=true&factor%5Bal_hr%5D=190.0&factor%5Bal_p%5D=180.0&ops=true&factor%5Bops_hr%5D=77.0&factor%5Bops_p%5D=250.0&eqz=true&factor%5Beqz_hr%5D=63.0&factor%5Beqz_p%5D=250.0&zlh=true&factor%5Bzlh_hr%5D=79.0&factor%5Bzlh_p%5D=250.0&kpw=true&factor%5Bkpw_hr%5D=39.5&factor%5Bkpw_p%5D=250.0&ppw=true&factor%5Bppw_hr%5D=38.9&factor%5Bppw_p%5D=250.0&x25x=true&factor%5Bx25x_hr%5D=11.1&factor%5Bx25x_p%5D=250.0&mtp=true&factor%5Bmtp_hr%5D=5.5&factor%5Bmtp_p%5D=250.0&vh=true&factor%5Bvh_hr%5D=1.45&factor%5Bvh_p%5D=240.0&factor%5Bcost%5D=0.1&sort=Profitability24&volume=0&revenue=24h&factor%5Bexchanges%5D%5B%5D=&factor%5Bexchanges%5D%5B%5D=binance&factor%5Bexchanges%5D%5B%5D=bitfinex&factor%5Bexchanges%5D%5B%5D=bitforex&factor%5Bexchanges%5D%5B%5D=bittrex&factor%5Bexchanges%5D%5B%5D=dove&factor%5Bexchanges%5D%5B%5D=exmo&factor%5Bexchanges%5D%5B%5D=gate&factor%5Bexchanges%5D%5B%5D=graviex&factor%5Bexchanges%5D%5B%5D=hitbtc&factor%5Bexchanges%5D%5B%5D=hotbit&factor%5Bexchanges%5D%5B%5D=ogre&factor%5Bexchanges%5D%5B%5D=poloniex&factor%5Bexchanges%5D%5B%5D=stex&dataset=")
    .then(res => res.json());

    // fetches the current BTC price (to convert from coin -> BTC -> USD)
    const btcStats = await fetch("https://whattomine.com/coins/1.json?hr=70000.0&p=2800.0&fee=0.0&cost=0.1&hcost=0.0&span_br=1h&span_d=")
    .then(res => res.json());
    
    // fetches all mineable coins
    const wtmAllCoins = await fetch("https://whattomine.com/calculators.json/")
    .then(res => res.json());
    
    console.log('done retrieving data');
    return {hiveStats, etherscanStats, txRes, wtmRankings, btcStats, wtmAllCoins };
}

client.login(discordAuth);