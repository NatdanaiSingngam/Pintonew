# 🍱 Pinto (ปิ่นโต) - AI-Powered Recipe Sharing Platform

Pinto คือแอปพลิเคชันเว็บแบบ Full-Stack สำหรับแบ่งปันสูตรอาหาร ที่มาพร้อมกับระบบ AI สมองกลในการวิเคราะห์และแนะนำเมนูอาหารที่คล้ายคลึงกัน (AI Recommendation) พัฒนาด้วยสถาปัตยกรรมแบบ Serverless และรองรับระบบ CI/CD เต็มรูปแบบ

## ✨ Features (ฟีเจอร์เด่น)
* **🤖 AI Recipe Recommendation:** ใช้เทคนิค NLP (Term Frequency) และสมการคณิตศาสตร์ `Cosine Similarity` ในการคำนวณความคล้ายคลึงของวัตถุดิบ เพื่อแนะนำเมนูที่ตรงใจผู้ใช้มากที่สุด
* **🔐 Seamless Authentication:** ระบบล็อกอินผ่าน Google Account และระบบ Guest Mode ที่มาพร้อม `Account Linking` (โอนข้อมูลจาก Guest ไปบัญชีจริงได้อัตโนมัติ)
* **🗄️ Real-time Database & Security:** จัดการข้อมูลด้วย Firebase Firestore พร้อมเขียน `Security Rules` ป้องกันการเข้าถึงและแก้ไขข้อมูลจากผู้ไม่หวังดี 100%
* **📸 Smart Image Management:** รองรับการอัปโหลดหลายรูปภาพ (Multiple Images) จัดการ UI แบบ Grid อัตโนมัติผ่าน ImgBB API
* **🚀 Automated CI/CD Pipeline:** เชื่อมต่อ GitHub Actions เพื่อทำการ Build และ Deploy ขึ้น GitHub Pages ทันทีที่มีการ Push โค้ด (Zero-downtime deployment)

## 🛠️ Tech Stack (เทคโนโลยีที่ใช้)
* **Frontend:** React.js, Tailwind CSS
* **Backend & BaaS:** Firebase (Authentication, Firestore Database)
* **AI / Algorithm:** Natural Language Processing (TF), Vector Space Model (Cosine Similarity)
* **DevOps / Hosting:** GitHub Actions, GitHub Pages
* **External API:** ImgBB (Image Hosting)

## 👨‍💻 Developer
Developed with ❤️ by [Natdanai Singngam]