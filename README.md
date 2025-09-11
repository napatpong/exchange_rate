# Exchange Rate PDF Exporter

โปรเจกต์นี้ใช้ Node.js + Puppeteer เพื่อดึงข้อมูลอัตราแลกเปลี่ยนจากเว็บไซต์ EXIM และ export เป็น PDF โดยจัดเก็บไฟล์ตามโฟลเดอร์ BOT/YYYY/MONTH และตั้งชื่อไฟล์ตามรูปแบบ BOT YYYY-MM-DD #N

## วิธีใช้งาน
1. ติดตั้ง dependencies ด้วยคำสั่ง `npm install`
2. รันโปรแกรมด้วยคำสั่ง `node exchange-export.js`

## คุณสมบัติ
- ดึงข้อมูลจาก https://www.exim.go.th/th/exchange_rate/exchange.aspx
- เลือกรอบจาก dropdown และ export PDF
- สร้างโฟลเดอร์อัตโนมัติ BOT/YYYY/MONTH
- ตั้งชื่อไฟล์ PDF ตามรูปแบบที่กำหนด

## หมายเหตุ
- ใช้งานแบบ headless (ไม่มี GUI)
- รองรับ Ubuntu
