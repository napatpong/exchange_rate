const dayjs = require('dayjs');
require('dayjs/locale/th');
dayjs.locale('th');

function isBusinessHours(timeString) {
  if (!timeString) {
    timeString = dayjs().format('HH:mm');
  }

  const [hour] = timeString.split(':').map(Number);
  const isInRange = hour >= 8 && hour < 16;
  
  return isInRange;
}

// ทดสอบเวลาต่างๆ
function testTimeValidation() {
  console.log('=== UOB Round Time Validation Test ===');
  
  // ตัวอย่างเวลาของรอบต่างๆ
  console.log('\n=== Round Time Examples ===');
  const testTimes = [
    { round: 1, time: '07:59' },
    { round: 2, time: '08:00' },
    { round: 3, time: '08:30' },
    { round: 4, time: '12:00' },
    { round: 5, time: '15:59' },
    { round: 6, time: '16:00' },
    { round: 7, time: '20:17' }
  ];
  
  testTimes.forEach(({ round, time }) => {
    const isValid = isBusinessHours(time);
    const status = isValid ? '✅ Export PDF' : '❌ Skip (Outside 8:00-15:59)';
    console.log(`Round ${round} - Time: ${time} → ${status}`);
  });
  
  console.log('\n=== Business Hours Rule ===');
  console.log('✅ Valid: 08:00 - 15:59');
  console.log('❌ Invalid: Before 08:00 or 16:00 onwards');
}

testTimeValidation();