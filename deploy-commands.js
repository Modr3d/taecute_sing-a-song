require('dotenv').config();
const { REST, Routes } = require('discord.js');

const commands = [
  {
    name: 'play', // ชื่อ command ต้องเป็นตัวอักษรปกติ
    description: '🎵 เล่นเพลงจาก YouTube',
    options: [
      {
        name: 'url',
        type: 3, // STRING
        description: 'URL ของ YouTube',
        required: true,
      },
    ],
  },
  {
    name: 'skip',
    description: '⏭ ข้ามเพลง',
  },
  {
    name: 'stop',
    description: '🛑 หยุดเพลงและออกจากห้อง',
  },
  {
    name: 'queue',
    description: '🎶 ดู queue ของเพลง',
  },
  {
    name: 'nowplaying',
    description: '🎧 ดูเพลงที่กำลังเล่น',
  },
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();
