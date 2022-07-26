# Mining Stats Bot

### What is it?

-   A Discord bot that returns general crypto mining statistics.
-   Specially used for monitoring GPU mineable coins and altcoins.

## Usage

| Command                      | Description                                            | Example Usage                  |
| ---------------------------- | ------------------------------------------------------ | ------------------------------ |
| --address <member>           | Member crypto address lookup                           | `--address Jacob`              |
| --coins top/all/count/<name> | View details about various GPU mineable cryptos        | `--coins top` or `--coins all` |
| --help                       | View all commands help                                 | `--help`                       |
| --ping                       | Test the bot's status                                  | `--ping`                       |
| --revenue <megahash>         | View projected Ethereum revenue from provided hashrate | `--revenue 1000`               |
| --info                       | View custom info box specified in infoEmbed.json       | `--info`                       |
| --tx <nonce/nonce.<stat>>    | View transaction details from master wallet            | `--tx 0` or `--tx 0.value`     |

### How to customize for your own use

-   [Required] Fill in the required values in the .env
    -   ETHERSCAN_KEY="your etherscan api key"
    -   DISCORD_TOKEN="your discord bot authentication token"
    -   ETH_ADDRESS="your ethereum address to track & load stats from"
        -   This would be your address for Hiveon pool (disable hive stats if not desired)
-   [Required] Change statsChannelId to a channel id that will display the stats
    -   The channel will be renamed regularily with the updated stats
-   [Optional] Add Ethereum addresses and aliases
    -   A sample implementation is located in addressDictionary.json
-   [Optional] Customize the Info Embed
    -   Alter the embed components in infoEmbed.json
    -   Run --info to show the embed
