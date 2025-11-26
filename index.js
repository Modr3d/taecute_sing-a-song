require('dotenv').config();

const { Client, GatewayIntentBits, EmbedBuilder, Events } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, NoSubscriberBehavior, AudioPlayerStatus } = require('@discordjs/voice');
const youtubedl = require('youtube-dl-exec');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// Queue ของแต่ละ server
const queues = new Map();

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// ฟัง Slash Commands
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName, options, guildId, member } = interaction;
    const serverQueue = queues.get(guildId);

    // ---------------- PLAY ----------------
    if (commandName === 'play') {
        await interaction.deferReply(); // เพิ่ม deferReply สำหรับงานที่ใช้เวลานาน

        const url = options.getString('url');
        if (!url) return interaction.editReply('ส่ง URL YouTube ถูก ๆ มาหน่อย');

        const voiceChannel = member.voice.channel;
        if (!voiceChannel) return interaction.editReply('เข้า voice channel ก่อนสิ!');

        let song;
        try {
            const info = await youtubedl(url, {
                dumpSingleJson: true,
                noWarnings: true,
                noCheckCertificate: true,
                preferFreeFormats: true,
                extractAudio: true
            });

            if (!info || !info.url) return interaction.editReply('❌ ไม่สามารถโหลดเพลงจาก YouTube ได้');

            song = { url: info.url, title: info.title };
        } catch (err) {
            console.error('youtube-dl error:', err);
            return interaction.editReply('❌ ไม่สามารถโหลดเพลงจาก YouTube ได้ ลอง URL อื่น');
        }

        if (!serverQueue) {
            const queueContruct = {
                voiceChannel,
                connection: joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: guildId,
                    adapterCreator: voiceChannel.guild.voiceAdapterCreator
                }),
                songs: [],
                player: createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } })
            };

            queueContruct.songs.push(song);
            queues.set(guildId, queueContruct);

            queueContruct.player.on(AudioPlayerStatus.Idle, () => {
                queueContruct.songs.shift();
                if (queueContruct.songs.length > 0) {
                    playSong(guildId, queueContruct.songs[0]);
                } else {
                    queueContruct.connection.destroy();
                    queues.delete(guildId);
                }
            });

            queueContruct.player.on('error', error => {
                console.error('Player error:', error);
                queueContruct.songs.shift();
                if (queueContruct.songs.length > 0) {
                    playSong(guildId, queueContruct.songs[0]);
                } else {
                    queueContruct.connection.destroy();
                    queues.delete(guildId);
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
        if (!serverQueue) return interaction.reply('ไม่มีเพลงเล่นอยู่');
        serverQueue.player.stop();
        await interaction.reply('ข้ามเพลงเรียบร้อย ✅');
    }

    // ---------------- STOP ----------------
    else if (commandName === 'stop') {
        if (!serverQueue) return interaction.reply('ไม่มีเพลงเล่นอยู่');
        serverQueue.songs = [];
        serverQueue.player.stop();
        serverQueue.connection.destroy();
        queues.delete(guildId);
        await interaction.reply('หยุดเพลงและออกจาก voice channel ✅');
    }

    // ---------------- NOW PLAYING ----------------
    else if (commandName === 'nowplaying') {
        if (!serverQueue || serverQueue.songs.length === 0) return interaction.reply('ไม่มีเพลงเล่นอยู่');
        const embed = new EmbedBuilder()
            .setTitle('กำลังเล่น 🎵')
            .setDescription(`**${serverQueue.songs[0].title}**`)
            .setColor('Green');
        await interaction.reply({ embeds: [embed] });
    }

    // ---------------- QUEUE ----------------
    else if (commandName === 'queue') {
        if (!serverQueue || serverQueue.songs.length === 0) return interaction.reply('ไม่มีเพลงใน queue');
        const queueList = serverQueue.songs.map((song, i) => `${i + 1}. ${song.title}`).join('\n');
        const embed = new EmbedBuilder()
            .setTitle('Queue ของเพลง 🎶')
            .setDescription(queueList)
            .setColor('Blue');
        await interaction.reply({ embeds: [embed] });
    }
});

// ฟังก์ชันเล่นเพลง
async function playSong(guildId, song) {
    const serverQueue = queues.get(guildId);
    if (!song || !serverQueue) return;

    console.log('🎧 Playing:', song.title, song.url);

    try {
        const resource = createAudioResource(song.url); // ใช้ URL จาก youtube-dl-exec
        serverQueue.player.play(resource);
    } catch (err) {
        console.error('Error creating audio resource:', err);
        serverQueue.songs.shift();
        if (serverQueue.songs.length > 0) {
            playSong(guildId, serverQueue.songs[0]);
        } else {
            serverQueue.connection.destroy();
            queues.delete(guildId);
        }
    }
}

client.login(process.env.DISCORD_TOKEN);
