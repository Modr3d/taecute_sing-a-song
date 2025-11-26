require('dotenv').config();

const { Client, GatewayIntentBits, EmbedBuilder, Events } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, NoSubscriberBehavior, AudioPlayerStatus } = require('@discordjs/voice');
const ytdlp = require('yt-dlp-exec'); // ใช้ yt-dlp แทน youtube-dl
const express = require('express');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages
    ]
});

// Queue ของแต่ละ server
const queues = new Map();

// ------------------- Keep-alive สำหรับ Render -------------------
const app = express();
app.get('/', (req, res) => res.send('Bot is alive!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`HTTP server running on port ${PORT}`));

// ------------------- Error handler -------------------
process.on('unhandledRejection', (err) => console.error('Unhandled Rejection:', err));
process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));

// ------------------- Bot ready -------------------
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// ------------------- Slash Commands -------------------
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName, options, guildId, member } = interaction;
    let serverQueue = queues.get(guildId);

    // ---------------- PLAY ----------------
    if (commandName === 'play') {
        const url = options.getString('url');
        if (!url) return interaction.reply('ส่ง URL YouTube ถูก ๆ มาหน่อย');

        const voiceChannel = member.voice.channel;
        if (!voiceChannel) return interaction.reply('เข้า voice channel ก่อนสิ!');

        await interaction.deferReply();

        let song;
        try {
            // ใช้ yt-dlp ดึง URL เสียงแบบ bypass
            const info = await ytdlp(url, {
                dumpSingleJson: true,
                noWarnings: true,
                preferFreeFormats: true,
                extractAudio: true,
                youtubeSkipDashManifest: true
            });

            if (!info || !info.url) return interaction.editReply('❌ ไม่สามารถโหลดเพลงจาก YouTube ได้');

            song = { url: info.url, title: info.title };
        } catch (err) {
            console.error('yt-dlp error:', err);
            return interaction.editReply('❌ ไม่สามารถโหลดเพลงจาก YouTube ได้ ลอง URL อื่น');
        }

        if (!serverQueue) {
            // สร้าง queue ใหม่
            const queueContruct = {
                voiceChannel,
                connection: joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: guildId,
                    adapterCreator: voiceChannel.guild.voiceAdapterCreator
                }),
                songs: [],
                player: createAudioPlayer({
                    behaviors: { noSubscriber: NoSubscriberBehavior.Play }
                })
            };

            queueContruct.songs.push(song);
            queues.set(guildId, queueContruct);

            queueContruct.player.on(AudioPlayerStatus.Idle, () => {
                queueContruct.songs.shift();
                if (queueContruct.songs.length > 0) {
                    playSong(guildId, queueContruct.songs[0]);
                }
            });

            queueContruct.player.on('error', error => {
                console.error('Player error:', error);
                queueContruct.songs.shift();
                if (queueContruct.songs.length > 0) {
                    playSong(guildId, queueContruct.songs[0]);
                }
            });

            queueContruct.connection.subscribe(queueContruct.player);

            await interaction.editReply(`🎧 กำลังเล่น: **${song.title}**`);
            playSong(guildId, song);
        } else {
            serverQueue.songs.push(song);
            await interaction.editReply(`✅ เพิ่มเพลงลง queue: **${song.title}**`);
            if (serverQueue.player.state.status === AudioPlayerStatus.Idle) {
                playSong(guildId, serverQueue.songs[0]);
            }
        }
    }

    // ---------------- SKIP ----------------
    else if (commandName === 'skip') {
        await interaction.deferReply({ ephemeral: true });
        if (!serverQueue) return interaction.editReply('ไม่มีเพลงเล่นอยู่');

        serverQueue.player.stop();
        await interaction.editReply('ข้ามเพลงเรียบร้อย ✅');
    }

    // ---------------- STOP ----------------
    else if (commandName === 'stop') {
        await interaction.deferReply({ ephemeral: true });
        if (!serverQueue) return interaction.editReply('ไม่มีเพลงเล่นอยู่');

        serverQueue.songs = [];
        serverQueue.player.stop();
        await interaction.editReply('หยุดเพลงแล้ว ✅ แต่ bot ยังคงอยู่ใน voice channel');
    }

    // ---------------- NOW PLAYING ----------------
    else if (commandName === 'nowplaying') {
        await interaction.deferReply({ ephemeral: true });
        if (!serverQueue || serverQueue.songs.length === 0) return interaction.editReply('ไม่มีเพลงเล่นอยู่');

        const embed = new EmbedBuilder()
            .setTitle('กำลังเล่น 🎵')
            .setDescription(`**${serverQueue.songs[0].title}**`)
            .setColor('Green');

        await interaction.editReply({ embeds: [embed] });
    }

    // ---------------- QUEUE ----------------
    else if (commandName === 'queue') {
        await interaction.deferReply({ ephemeral: true });
        if (!serverQueue || serverQueue.songs.length === 0) return interaction.editReply('ไม่มีเพลงใน queue');

        const queueList = serverQueue.songs.map((song, i) => `${i + 1}. ${song.title}`).join('\n');
        const embed = new EmbedBuilder()
            .setTitle('Queue ของเพลง 🎶')
            .setDescription(queueList)
            .setColor('Blue');

        await interaction.editReply({ embeds: [embed] });
    }
});

// ------------------- ฟังก์ชันเล่นเพลง -------------------
const playdl = require("play-dl");

async function playSong(guildId, song) {
    const serverQueue = queues.get(guildId);
    if (!song || !serverQueue) return;

    const stream = await playdl.stream(song.url);

    const resource = createAudioResource(stream.stream, {
        inputType: stream.type
    });
    serverQueue.player.play(resource);
}


client.login(process.env.DISCORD_TOKEN);
