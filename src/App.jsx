import React, { useState, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import { db, auth } from './firebase'; 
import { updateProfile } from 'firebase/auth';
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove, deleteDoc } from 'firebase/firestore';

const IMGBB_API_KEY = "b71476387444bc1fda933927fa2e82e9";

function App() {
  const { currentUser, loginWithGoogle, logout } = useAuth();
  const [recipes, setRecipes] = useState([]);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState("all");

  // State สำหรับ Profile
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newPhotoURL, setNewPhotoURL] = useState(""); // สำหรับแสดงตัวอย่าง
  const [profileImageFile, setProfileImageFile] = useState(null); // สำหรับเก็บไฟล์ที่จะอัปโหลด
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // ข้อมูลฟอร์มสร้างสูตร
  const [formData, setFormData] = useState({ title: '', ingredients: '', instructions: '', isPublic: true });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "recipes"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const recipesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRecipes(recipesData);
    });
    return () => unsubscribe(); 
  }, []);

  // ฟังก์ชันเลือกรูปโปรไฟล์ (เหมือนเลือกรูปเมนู)
  const handleProfileImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setProfileImageFile(file);
      setNewPhotoURL(URL.createObjectURL(file)); // แสดง Preview ทันที
    }
  };

  // ฟังก์ชันบันทึกโปรไฟล์ใหม่
  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!newDisplayName.trim()) return alert("กรุณากรอกชื่อด้วยครับ");
    
    setIsUpdatingProfile(true);
    let finalPhotoURL = currentUser.photoURL;

    try {
      // 1. ถ้ามีการเลือกรูปใหม่ ให้ส่งไป ImgBB ก่อน
      if (profileImageFile) {
        const imgData = new FormData();
        imgData.append("image", profileImageFile);
        const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: imgData });
        const data = await res.json();
        if (data.success) {
          finalPhotoURL = data.data.url;
        }
      }

      // 2. อัปเดตข้อมูลใน Firebase Auth
      await updateProfile(auth.currentUser, {
        displayName: newDisplayName,
        photoURL: finalPhotoURL
      });

      alert("อัปเดตโปรไฟล์สำเร็จ! ✨");
      setIsEditingProfile(false);
      setShowProfileMenu(false);
      window.location.reload(); 
    } catch (error) {
      console.error(error);
      alert("เกิดข้อผิดพลาดในการบันทึก");
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmitRecipe = async (e) => {
    e.preventDefault(); 
    if (!formData.title || !imageFile) return alert("กรุณากรอกชื่อเมนูและเลือกรูปภาพนะครับ");
    setIsUploading(true);
    try {
      const imageFormData = new FormData();
      imageFormData.append("image", imageFile);
      const imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: imageFormData });
      const imgbbData = await imgbbRes.json();
      const imageUrl = imgbbData.data.url; 

      await addDoc(collection(db, "recipes"), {
        title: formData.title,
        image: imageUrl,
        ingredients: formData.ingredients,
        instructions: formData.instructions,
        isPublic: formData.isPublic,
        author: currentUser?.displayName || "เชฟนิรนาม", 
        authorId: currentUser?.uid,
        likedBy: [], 
        createdAt: serverTimestamp() 
      });
      setIsCreating(false); 
      setFormData({ title: '', ingredients: '', instructions: '', isPublic: true }); 
      setImageFile(null);
      setImagePreview(null);
    } catch (error) { console.error(error); } finally { setIsUploading(false); }
  };

  const filteredRecipes = recipes.filter(r => {
    const isOwner = r.authorId === currentUser?.uid;
    const isPublic = r.isPublic !== false;
    let passesTab = filterTab === "all" ? isPublic : filterTab === "my_recipes" ? isOwner : (r.likedBy?.includes(currentUser?.uid) && (isPublic || isOwner));
    return passesTab && (r.title.toLowerCase().includes(searchQuery.toLowerCase()) || r.ingredients.toLowerCase().includes(searchQuery.toLowerCase()));
  });

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <nav className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-16 flex justify-between items-center">
          <h1 className="text-3xl font-extrabold text-orange-500 cursor-pointer" onClick={() => setFilterTab("all")}>Pinto</h1>
          
          <div className="flex-1 max-w-xl mx-8 hidden sm:block">
            <input type="text" placeholder="ค้นหาสูตร..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-gray-100 rounded-full py-2 px-5 outline-none focus:ring-2 focus:ring-orange-300" />
          </div>

          <div className="flex items-center space-x-4">
            <button onClick={() => setIsCreating(true)} className="bg-orange-500 text-white px-5 py-2 rounded-full font-medium">+ สร้างสูตร</button>
            
            <div className="relative">
              <div 
                className="w-10 h-10 rounded-full border-2 border-orange-200 cursor-pointer overflow-hidden bg-gray-100"
                onClick={() => setShowProfileMenu(!showProfileMenu)}
              >
                <img src={currentUser?.photoURL || "https://www.svgrepo.com/show/529259/user-circle.svg"} alt="P" className="w-full h-full object-cover" />
              </div>

              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50">
                  <div className="px-4 py-2 border-b border-gray-50 mb-1">
                    <p className="text-xs text-gray-400 font-bold uppercase">บัญชีของคุณ</p>
                    <p className="text-sm font-bold text-gray-700 truncate">{currentUser?.displayName || "เชฟนิรนาม"}</p>
                  </div>
                  
                  {/* 👇 ดักไว้ว่าถ้าเป็น Guest (isAnonymous) จะไม่โชว์ปุ่มแก้ไข */}
                  {!currentUser?.isAnonymous && (
                    <button 
                      onClick={() => {
                        setNewDisplayName(currentUser?.displayName || "");
                        setNewPhotoURL(currentUser?.photoURL || "");
                        setIsEditingProfile(true);
                        setShowProfileMenu(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 flex items-center"
                    >
                      <span className="mr-2">📝</span> แก้ไขโปรไฟล์
                    </button>
                  )}

                  <button 
                    onClick={() => { logout(); setShowProfileMenu(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 flex items-center"
                  >
                    <span className="mr-2">🚪</span> ออกจากระบบ
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex space-x-3 mb-8 overflow-x-auto pb-2 scrollbar-hide">
          <button onClick={() => setFilterTab('all')} className={`px-5 py-2 rounded-full text-sm font-bold border ${filterTab === 'all' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600'}`}>🌐 ฟีดรวม</button>
          <button onClick={() => setFilterTab('my_recipes')} className={`px-5 py-2 rounded-full text-sm font-bold border ${filterTab === 'my_recipes' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600'}`}>🍳 สูตรของฉัน</button>
          <button onClick={() => setFilterTab('liked')} className={`px-5 py-2 rounded-full text-sm font-bold border ${filterTab === 'liked' ? 'bg-red-500 text-white' : 'bg-white text-gray-600'}`}>❤️ ที่ถูกใจ</button>
        </div>

        <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
          {filteredRecipes.map((recipe) => (
            <div key={recipe.id} onClick={() => setSelectedRecipe(recipe)} className="bg-white rounded-2xl shadow-sm overflow-hidden break-inside-avoid border border-gray-100 relative group cursor-pointer">
              {recipe.isPublic === false && <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-full z-10">🔒 ส่วนตัว</div>}
              <img src={recipe.image} alt={recipe.title} className="w-full h-auto object-cover" />
              <div className="p-4">
                <h3 className="font-bold text-gray-800 line-clamp-2">{recipe.title}</h3>
                <p className="text-[10px] text-gray-400 mt-1">โดย {recipe.author}</p>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* --- Modal แก้ไขโปรไฟล์ (V.ใหม่ อัปโหลดรูปได้) --- */}
      {isEditingProfile && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md p-8 relative shadow-2xl">
            <button onClick={() => setIsEditingProfile(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl">✕</button>
            <h2 className="text-2xl font-extrabold text-gray-800 mb-6 text-center">📝 แก้ไขโปรไฟล์</h2>
            <form onSubmit={handleUpdateProfile} className="space-y-6">
              
              <div className="flex flex-col items-center">
                <div className="w-28 h-28 rounded-full border-4 border-orange-100 overflow-hidden bg-gray-50 mb-4 shadow-inner">
                  <img src={newPhotoURL || currentUser?.photoURL || "https://www.svgrepo.com/show/529259/user-circle.svg"} alt="Preview" className="w-full h-full object-cover" />
                </div>
                {/* 👇 ปุ่มเลือกรูปภาพเหมือนตอนสร้างเมนู */}
                <label className="cursor-pointer bg-orange-50 text-orange-600 px-4 py-2 rounded-full text-xs font-bold hover:bg-orange-100 transition-colors">
                  📸 เปลี่ยนรูปโปรไฟล์
                  <input type="file" accept="image/*" onChange={handleProfileImageChange} className="hidden" />
                </label>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2 ml-1">ชื่อที่แสดงผล</label>
                <input 
                  type="text" 
                  value={newDisplayName} 
                  onChange={(e) => setNewDisplayName(e.target.value)} 
                  className="w-full border-2 border-gray-100 bg-gray-50 rounded-2xl py-3 px-4 outline-none focus:border-orange-300" 
                  placeholder="ใส่ชื่อเชฟของคุณ..."
                />
              </div>

              <div className="pt-4 flex space-x-3">
                <button type="button" onClick={() => setIsEditingProfile(false)} className="flex-1 py-3 font-bold text-gray-400">ยกเลิก</button>
                <button type="submit" disabled={isUpdatingProfile} className="flex-2 bg-orange-500 text-white py-3 px-8 rounded-2xl font-bold hover:bg-orange-600 disabled:opacity-50 transition-all">
                  {isUpdatingProfile ? "⏳ กำลังบันทึก..." : "✅ บันทึก"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Popups สร้างสูตร/ดูสูตร (เหมือนเดิม) */}
      {isCreating && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-xl p-6 relative shadow-2xl">
            <button onClick={() => setIsCreating(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">✕</button>
            <h2 className="text-xl font-bold mb-6">จดสูตรอาหารใหม่ ✍️</h2>
            <form onSubmit={handleSubmitRecipe} className="space-y-4">
              {imagePreview && <img src={imagePreview} className="w-full h-40 object-cover rounded-xl border" />}
              <input type="file" accept="image/*" onChange={handleImageChange} className="w-full text-sm border p-2 rounded-xl" />
              <input type="text" placeholder="ชื่อเมนู" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} className="w-full border p-3 rounded-xl outline-none" />
              <textarea placeholder="ส่วนผสม" value={formData.ingredients} onChange={(e) => setFormData({...formData, ingredients: e.target.value})} className="w-full border p-3 rounded-xl outline-none" rows="2"></textarea>
              <textarea placeholder="วิธีทำ" value={formData.instructions} onChange={(e) => setFormData({...formData, instructions: e.target.value})} className="w-full border p-3 rounded-xl outline-none" rows="3"></textarea>
              <div className="flex items-center justify-between bg-gray-50 p-4 rounded-2xl border border-dashed border-gray-300">
                <p className="text-sm font-bold text-gray-700">แชร์สาธารณะ</p>
                <div onClick={() => setFormData({...formData, isPublic: !formData.isPublic})} className={`w-14 h-8 flex items-center rounded-full p-1 cursor-pointer transition-colors ${formData.isPublic ? 'bg-green-500' : 'bg-gray-400'}`}>
                  <div className={`bg-white w-6 h-6 rounded-full shadow-md transform transition-transform ${formData.isPublic ? 'translate-x-6' : ''}`}></div>
                </div>
              </div>
              <button type="submit" disabled={isUploading} className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold hover:bg-orange-600 disabled:opacity-50">
                {isUploading ? "กำลังบันทึก..." : "บันทึกสูตร"}
              </button>
            </form>
          </div>
        </div>
      )}

      {selectedRecipe && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSelectedRecipe(null)}>
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-0 relative shadow-2xl" onClick={e => e.stopPropagation()}>
            <img src={selectedRecipe.image} className="w-full h-64 object-cover" />
            <div className="p-8">
              <h2 className="text-3xl font-extrabold text-gray-800">{selectedRecipe.title}</h2>
              <p className="text-sm text-gray-400 mb-6">โดย {selectedRecipe.author}</p>
              <div className="bg-orange-50 p-6 rounded-2xl mb-4"><p>{selectedRecipe.ingredients}</p></div>
              <div className="bg-gray-50 p-6 rounded-2xl"><p>{selectedRecipe.instructions}</p></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;