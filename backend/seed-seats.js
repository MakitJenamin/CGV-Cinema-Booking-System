const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

async function seed() {
  console.log('Reading .env...');
  const envPath = path.resolve(__dirname, '.env');
  let mongoUri = '';

  try {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const lines = envContent.split('\n');
    for (const line of lines) {
      if (line.startsWith('MONGODB_URI=')) {
        mongoUri = line.split('=')[1].trim();
        // Remove quotes if present
        if (mongoUri.startsWith('"') && mongoUri.endsWith('"')) {
          mongoUri = mongoUri.slice(1, -1);
        }
        // Robust cleanup using URL class
        try {
          const url = new URL(mongoUri);
          url.searchParams.delete('appName');
          mongoUri = url.toString();
        } catch (e) {
          if (mongoUri.includes('appName=')) {
            mongoUri = mongoUri
              .replace(/&?appName=[^&]+/, '')
              .replace(/\?$/, '');
          }
        }
        break;
      }
    }
    console.log(
      'URI found (masked):',
      mongoUri.replace(/:([^:@]+)@/, ':****@'),
    );
  } catch (err) {
    console.error('Could not read .env', err);
    process.exit(1);
  }

  if (!mongoUri) {
    console.error('MONGODB_URI not found in .env');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected!');

  const db = mongoose.connection.db;
  const seatsCollection = db.collection('seats');

  // Hardcoded IDs from previous steps
  const screens = [
    {
      id: new mongoose.Types.ObjectId('671b9410d34b23f0a4b9e301'),
      name: 'Screen 01',
    },
    {
      id: new mongoose.Types.ObjectId('671b9410d34b23f0a4b9e302'),
      name: 'IMAX Screen',
    },
    {
      id: new mongoose.Types.ObjectId('671b9410d34b23f0a4b9e303'),
      name: 'Screen 03',
    },
    {
      id: new mongoose.Types.ObjectId('671b9410d34b23f0a4b9e304'),
      name: 'Standard 01',
    },
    {
      id: new mongoose.Types.ObjectId('671b9410d34b23f0a4b9e305'),
      name: 'Standard 02',
    },
  ];

  const seatTypes = {
    standard: new mongoose.Types.ObjectId('6730a001aaab000000000001'),
    vip: new mongoose.Types.ObjectId('6730a001aaab000000000002'),
    couple: new mongoose.Types.ObjectId('6730a001aaab000000000003'),
  };

  const rows = [
    'A',
    'B',
    'C',
    'D',
    'E',
    'F',
    'G',
    'H',
    'I',
    'J',
    'K',
    'L',
    'M',
    'N',
    'O',
  ];

  console.log('Deleting existing seats...');
  await seatsCollection.deleteMany({});

  let totalInserted = 0;

  for (const screen of screens) {
    console.log(`Generating seats for ${screen.name}...`);
    const seats = [];

    // Generate ~150 seats (10 rows x 15 seats)
    // Rows A-H (Standard), I-J (VIP), K (Couple)

    // 8 rows Standard * 16 seats = 128
    // 2 rows VIP * 14 seats = 28
    // 1 row Couple * 8 seats = 8
    // Total ~164 seats

    for (let r = 0; r < 11; r++) {
      // 0-10 (A-K)
      const rowLabel = rows[r];
      let typeId = seatTypes.standard;
      let typeCode = 'standard';
      let seatsInRow = 16;

      if (r >= 8 && r <= 9) {
        // I, J
        typeId = seatTypes.vip;
        typeCode = 'vip';
        seatsInRow = 14;
      } else if (r === 10) {
        // K
        typeId = seatTypes.couple;
        typeCode = 'couple';
        seatsInRow = 8;
      }

      for (let n = 1; n <= seatsInRow; n++) {
        seats.push({
          screenId: screen.id,
          row: rowLabel,
          number: n,
          seatTypeId: typeId,
          seatTypeCode: typeCode, // denormalized
          isActive: true,
        });
      }
    }

    if (seats.length > 0) {
      await seatsCollection.insertMany(seats);
      totalInserted += seats.length;
      console.log(`Inserted ${seats.length} seats for ${screen.name}`);
    }
  }

  console.log(`Done! Total seats: ${totalInserted}`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
