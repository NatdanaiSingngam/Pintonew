import React, { useState, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import { db, auth } from './firebase'; 
import { updateProfile } from 'firebase/auth';
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove, deleteDoc } from 'firebase/firestore';

const IMGBB_API_KEY = "b71476387444bc1fda933927fa2e82e9";

// 🧠 --- AI Helper Functions ---
function getTermFrequency(text) {
  if (!text) return {};
  const words = text.split(/[\s,]+/).filter(w => w.trim() !== '');
  const tf = {};
  words.forEach(w => {
    const word = w.toLowerCase();
    tf[word] = (tf[word] || 0) + 1;
  });
  return tf;
}

function calculateCosineSimilarity(tf1, tf2) {
  const uniqueWords = new Set([...Object.keys(tf1), ...Object.keys(tf2)]);
  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;
  uniqueWords.forEach(w => {
    const val1 = tf1[w] || 0;
    const val2 = tf2[w] || 0;
    dotProduct += val1 * val2;
    mag1 += val1 * val1;
    mag2 += val2 * val2;
  });
  if (mag1 === 0 || mag2 === 0) return 0;
  return dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));
}

function App() {
  const { currentUser, loginWithGoogle, logout } = useAuth();
  const [recipes, setRecipes] = useState([]);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState("all");

  // 👤 State สำหรับ Profile Menu
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newPhotoURL, setNewPhotoURL] = useState(""); 
  const [profileImageFile, setProfileImageFile] = useState(null); 
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // 💬 State สำหรับคอมเมนต์
  const [commentText, setCommentText] = useState("");

  // 📸 ข้อมูลฟอร์มสร้างสูตร (อัปเกรดเป็น Array รองรับหลายรูป)
  const [formData, setFormData] = useState({ title: '', ingredients: '', instructions: '', isPublic: true });
  const [imageFiles, setImageFiles] = useState([]); // เก็บไฟล์หลายไฟล์
  const [imagePreviews, setImagePreviews] = useState([]); // เก็บ Preview หลายรูป
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "recipes"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const recipesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRecipes(recipesData);
      
      // อัปเดตข้อมูลสูตรที่กำลังเปิดดูอยู่ (เพื่อให้คอมเมนต์และไลก์เด้ง Real-time)
      if (selectedRecipe) {
        const updatedActive = recipesData.find(r => r.id === selectedRecipe.id);
        if (updatedActive) setSelectedRecipe(updatedActive);
      }
    });
    return () => unsubscribe(); 
  }, [selectedRecipe?.id]);

  const handleProfileImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setProfileImageFile(file);
      setNewPhotoURL(URL.createObjectURL(file)); 
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!newDisplayName.trim()) return alert("กรุณากรอกชื่อด้วยครับ");
    setIsUpdatingProfile(true);
    let finalPhotoURL = currentUser.photoURL;

    try {
      if (profileImageFile) {
        const imgData = new FormData();
        imgData.append("image", profileImageFile);
        const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: imgData });
        const data = await res.json();
        if (data.success) {
          finalPhotoURL = data.data.url;
        }
      }
      await updateProfile(auth.currentUser, { displayName: newDisplayName, photoURL: finalPhotoURL });
      alert("อัปเดตโปรไฟล์สำเร็จ! ✨");
      setIsEditingProfile(false);
      setShowProfileMenu(false);
      window.location.reload(); 
    } catch (error) {
      console.error(error);
      alert("เกิดข้อผิดพลาดในการบันทึกโปรไฟล์");
    } finally { setIsUpdatingProfile(false); }
  };

  // 📸 ฟังก์ชันเลือกหลายรูปภาพ
  const handleImagesChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      setImageFiles(prev => [...prev, ...files]);
      const previews = files.map(f => URL.createObjectURL(f));
      setImagePreviews(prev => [...prev, ...previews]);
    }
  };

  const removeImage = (index) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitRecipe = async (e) => {
    e.preventDefault(); 
    if (!formData.title || imageFiles.length === 0) return alert("กรุณากรอกชื่อเมนูและเลือกรูปภาพอย่างน้อย 1 รูปนะครับ 📸");
    
    setIsUploading(true);
    try {
      // อัปโหลดรูปภาพทั้งหมดด้วยการวนลูป
      const imageUrls = [];
      for (const file of imageFiles) {
        const imageFormData = new FormData();
        imageFormData.append("image", file);
        const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: imageFormData });
        const data = await res.json();
        if (data.success) imageUrls.push(data.data.url);
      }

      // 🛑 ล็อกสิทธิ์ Guest: ถ้าเป็น Guest ให้เป็น Private เสมอ
      const isGuest = currentUser?.isAnonymous;
      const finalIsPublic = isGuest ? false : formData.isPublic;

      await addDoc(collection(db, "recipes"), {
        title: formData.title,
        images: imageUrls, // เก็บเป็น Array สำหรับหลายรูป
        image: imageUrls[0], // เก็บภาพแรกไว้โชว์หน้าปก (สำรอง)
        ingredients: formData.ingredients,
        instructions: formData.instructions,
        isPublic: finalIsPublic,
        author: isGuest ? "เชฟนิรนาม (Guest)" : (currentUser?.displayName || "เชฟนิรนาม"), 
        authorId: currentUser?.uid,
        likedBy: [], 
        comments: [], // เตรียมพื้นที่สำหรับคอมเมนต์
        createdAt: serverTimestamp() 
      });

      alert("🎉 บันทึกสูตรอาหารสำเร็จ!");
      setIsCreating(false); 
      setFormData({ title: '', ingredients: '', instructions: '', isPublic: true }); 
      setImageFiles([]);
      setImagePreviews([]);
    } catch (error) { 
      console.error(error); 
    } finally { 
      setIsUploading(false); 
    }
  };

  const handleLike = async (e, recipe) => {
    e.stopPropagation();
    if (!currentUser?.uid) return;
    const recipeRef = doc(db, "recipes", recipe.id);
    const hasLiked = recipe.likedBy?.includes(currentUser.uid);
    await updateDoc(recipeRef, {
      likedBy: hasLiked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid)
    });
  };

  const handleDeleteRecipe = async (recipeId) => {
    if (window.confirm("แน่ใจนะว่าจะลบสูตรอาหารนี้? ลบแล้วกู้คืนไม่ได้น้า 🥺")) {
      try {
        await deleteDoc(doc(db, "recipes", recipeId));
        setSelectedRecipe(null); 
      } catch (error) { console.error("Error deleting document: ", error); }
    }
  };

  // 💬 ฟังก์ชันส่งคอมเมนต์
  const handleAddComment = async (e, recipeId) => {
    e.preventDefault();
    if (!commentText.trim() || currentUser?.isAnonymous) return; // Guest โดนดักตรงนี้ด้วย
    
    try {
      const recipeRef = doc(db, "recipes", recipeId);
      await updateDoc(recipeRef, {
        comments: arrayUnion({
          id: Date.now().toString(),
          uid: currentUser.uid,
          author: currentUser.displayName || "เชฟนิรนาม",
          photoURL: currentUser.photoURL || "https://www.svgrepo.com/show/529259/user-circle.svg",
          text: commentText,
          createdAt: new Date()
        })
      });
      setCommentText(""); // ล้างกล่องข้อความ
    } catch (error) {
      console.error("Comment error:", error);
    }
  };

  // 🔍 กรองสูตรอาหาร
  const filteredRecipes = recipes.filter(r => {
    const isOwner = currentUser && r.authorId === currentUser.uid;
    const isPublic = r.isPublic !== false;
    
    let passesTab = false;
    if (filterTab === "all") passesTab = isPublic;
    else if (filterTab === "my_recipes") passesTab = isOwner;
    else if (filterTab === "liked") passesTab = currentUser && r.likedBy?.includes(currentUser.uid) && (isPublic || isOwner);

    const searchLower = searchQuery.toLowerCase();
    const matchSearch = r.title?.toLowerCase().includes(searchLower) || r.ingredients?.toLowerCase().includes(searchLower);

    return passesTab && matchSearch;
  });

  return (
    <div className="min-h-screen bg-gray-50 font-sans relative">
      <nav className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-16 flex justify-between items-center">
          <h1 className="text-3xl font-extrabold text-orange-500 cursor-pointer" onClick={() => setFilterTab("all")}>Pinto</h1>
          <div className="flex-1 max-w-xl mx-8 hidden sm:block">
            <div className="relative">
              <input type="text" placeholder="ค้นหาสูตร หรือส่วนผสม..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-gray-100 rounded-full py-2 px-5 outline-none focus:ring-2 focus:ring-orange-300 transition-all" />
              {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-4 top-2 text-gray-400 hover:text-gray-600">✕</button>}
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <button onClick={() => setIsCreating(true)} className="bg-orange-500 text-white px-5 py-2 rounded-full font-medium shadow-sm hover:bg-orange-600 transition-colors">+ สร้างสูตร</button>
            
            {currentUser?.isAnonymous ? (
              <button onClick={loginWithGoogle} className="flex items-center space-x-2 bg-white border border-gray-200 px-4 py-2 rounded-full text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all shadow-sm">
                <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="G" className="w-4 h-4" />
                <span>ล็อกอิน / สมัคร</span>
              </button>
            ) : (
              <div className="relative">
                <div className="w-10 h-10 rounded-full border-2 border-orange-200 cursor-pointer overflow-hidden bg-gray-100 shadow-sm hover:ring-2 hover:ring-orange-300 transition-all" onClick={() => setShowProfileMenu(!showProfileMenu)}>
                  <img src={currentUser?.photoURL || "https://www.svgrepo.com/show/529259/user-circle.svg"} alt="P" className="w-full h-full object-cover" />
                </div>
                {showProfileMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50">
                    <div className="px-4 py-2 border-b border-gray-50 mb-1">
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">บัญชีของคุณ</p>
                      <p className="text-sm font-bold text-gray-700 truncate">{currentUser?.displayName || "เชฟนิรนาม"}</p>
                    </div>
                    <button onClick={() => { setNewDisplayName(currentUser?.displayName || ""); setNewPhotoURL(currentUser?.photoURL || ""); setIsEditingProfile(true); setShowProfileMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 flex items-center transition-colors">
                      <span className="mr-2">📝</span> แก้ไขโปรไฟล์
                    </button>
                    <button onClick={() => { logout(); setShowProfileMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 flex items-center transition-colors">
                      <span className="mr-2">🚪</span> ออกจากระบบ
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex space-x-3 mb-8 overflow-x-auto pb-2 scrollbar-hide">
          <button onClick={() => setFilterTab('all')} className={`px-5 py-2.5 rounded-full text-sm font-bold border transition-all ${filterTab === 'all' ? 'bg-gray-800 text-white border-gray-800 shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'}`}>🌐 ฟีดรวม</button>
          <button onClick={() => setFilterTab('my_recipes')} className={`px-5 py-2.5 rounded-full text-sm font-bold border transition-all ${filterTab === 'my_recipes' ? 'bg-orange-500 text-white border-orange-500 shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'}`}>🍳 สูตรของฉัน</button>
          <button onClick={() => setFilterTab('liked')} className={`px-5 py-2.5 rounded-full text-sm font-bold border transition-all ${filterTab === 'liked' ? 'bg-red-500 text-white border-red-500 shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'}`}>❤️ ที่ถูกใจ</button>
        </div>

        {filteredRecipes.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
             <span className="text-4xl block mb-4">🔍</span>ไม่พบสูตรอาหารในหมวดหมู่นี้ ลองค้นหาหรือเพิ่มสูตรใหม่ดูสิครับ!
          </div>
        ) : (
          <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
            {filteredRecipes.map((recipe) => (
              <div key={recipe.id} onClick={() => setSelectedRecipe(recipe)} className="bg-white rounded-2xl shadow-sm overflow-hidden break-inside-avoid border border-gray-100 relative group cursor-pointer hover:shadow-md transition-shadow">
                {recipe.isPublic === false && <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-full z-10 backdrop-blur-sm">🔒 ส่วนตัว</div>}
                <div className="w-full bg-gray-200 overflow-hidden relative aspect-square">
                   {/* 🖼️ ใช้ aspect-square + object-cover จัดการรูปให้เป็นสี่เหลี่ยมจัตุรัสแบบไม่เบี้ยว */}
                   <img src={recipe.image || recipe.images?.[0]} alt={recipe.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                   {currentUser?.uid === recipe.authorId && (
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteRecipe(recipe.id); }} className="absolute top-2 right-2 bg-black/40 hover:bg-red-500 text-white p-1.5 rounded-full transition-colors backdrop-blur-sm opacity-0 group-hover:opacity-100" title="ลบสูตรนี้">🗑️</button>
                    )}
                </div>
                <div className="p-4">
                  <h3 className="font-bold text-gray-800 line-clamp-2">{recipe.title}</h3>
                  <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
                    <div className="flex items-center space-x-1">
                      <div className="w-5 h-5 bg-orange-100 rounded-full flex items-center justify-center text-[10px] font-bold text-orange-600">{recipe.author?.[0] || 'U'}</div>
                      <span className="truncate max-w-[80px]">{recipe.author}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-gray-400">💬 {recipe.comments?.length || 0}</span>
                      <button onClick={(e) => handleLike(e, recipe)} className={`flex items-center space-x-1 px-2 py-1 rounded-full transition-colors ${recipe.likedBy?.includes(currentUser?.uid) ? 'text-red-500 bg-red-50' : 'text-gray-400 bg-gray-50 hover:bg-red-50 hover:text-red-500'}`}>
                        <span>{recipe.likedBy?.includes(currentUser?.uid) ? '❤️' : '🤍'}</span>
                        <span>{recipe.likedBy?.length || 0}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* --- Modal แก้ไขโปรไฟล์ (คงเดิม) --- */}
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
                <label className="cursor-pointer bg-orange-50 text-orange-600 px-4 py-2 rounded-full text-xs font-bold hover:bg-orange-100 transition-colors border border-orange-200">
                  📸 เปลี่ยนรูปโปรไฟล์
                  <input type="file" accept="image/*" onChange={handleProfileImageChange} className="hidden" />
                </label>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2 ml-1">ชื่อที่แสดงผล</label>
                <input type="text" value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} className="w-full border-2 border-gray-100 bg-gray-50 rounded-2xl py-3 px-4 outline-none focus:border-orange-300" placeholder="ใส่ชื่อเชฟของคุณ..." />
              </div>
              <div className="pt-4 flex space-x-3">
                <button type="button" onClick={() => setIsEditingProfile(false)} className="flex-1 py-3 font-bold text-gray-400 hover:bg-gray-100 rounded-2xl transition-colors">ยกเลิก</button>
                <button type="submit" disabled={isUpdatingProfile} className="flex-2 bg-orange-500 text-white py-3 px-8 rounded-2xl font-bold hover:bg-orange-600 disabled:opacity-50 transition-all shadow-md shadow-orange-200">
                  {isUpdatingProfile ? "⏳ กำลังบันทึก..." : "✅ บันทึกโปรไฟล์"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- Modal สร้างสูตร (ระบบอัปโหลดหลายรูป + ฟิกซ์ขนาด) --- */}
      {isCreating && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-xl p-6 relative shadow-2xl overflow-y-auto max-h-[90vh]">
            <button onClick={() => setIsCreating(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">✕</button>
            <h2 className="text-xl font-bold mb-6">จดสูตรอาหารใหม่ ✍️</h2>
            <form onSubmit={handleSubmitRecipe} className="space-y-4">
              
              {/* 🖼️ แสดงภาพตัวอย่าง (เรียงเป็นกริด + สี่เหลี่ยมจัตุรัสเป๊ะๆ) */}
              {imagePreviews.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {imagePreviews.map((preview, idx) => (
                    <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200">
                      <img src={preview} className="w-full h-full object-cover" />
                      <button type="button" onClick={() => removeImage(idx)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600">✕</button>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2 flex justify-between items-end">
                  <span>รูปภาพอาหาร <span className="text-gray-400 text-xs font-normal">(เลือกได้หลายรูป)</span></span>
                </label>
                {/* ปุ่มอัปโหลดหลายรูป */}
                <input type="file" multiple accept="image/*" onChange={handleImagesChange} className="w-full text-sm border p-2 rounded-xl bg-gray-50" />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">ชื่อเมนู</label>
                <input type="text" placeholder="เช่น กะเพราหมูสับ" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-300" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">ส่วนผสม</label>
                <textarea placeholder="หมูสับ, ใบกะเพรา..." value={formData.ingredients} onChange={(e) => setFormData({...formData, ingredients: e.target.value})} className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-300" rows="2"></textarea>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">วิธีทำ</label>
                <textarea placeholder="1. ตั้งกระทะ..." value={formData.instructions} onChange={(e) => setFormData({...formData, instructions: e.target.value})} className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-300" rows="3"></textarea>
              </div>
              
              {/* 🔒 ล็อกสิทธิ์ Guest ไม่ให้เปิด Public */}
              <div className="flex items-center justify-between bg-gray-50 p-4 rounded-2xl border border-dashed border-gray-300">
                <div>
                  <p className="text-sm font-bold text-gray-700">แชร์สาธารณะ</p>
                  <p className="text-[10px] text-gray-500">
                    {currentUser?.isAnonymous ? "บัญชี Guest ไม่สามารถแชร์สาธารณะได้" : "เปิดเพื่อให้คนอื่นเห็นสูตรนี้ในฟีดรวมได้"}
                  </p>
                </div>
                {!currentUser?.isAnonymous && (
                  <div onClick={() => setFormData({...formData, isPublic: !formData.isPublic})} className={`w-14 h-8 flex items-center rounded-full p-1 cursor-pointer transition-colors ${formData.isPublic ? 'bg-green-500' : 'bg-gray-400'}`}>
                    <div className={`bg-white w-6 h-6 rounded-full shadow-md transform transition-transform ${formData.isPublic ? 'translate-x-6' : ''}`}></div>
                  </div>
                )}
              </div>
              
              <button type="submit" disabled={isUploading} className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold hover:bg-orange-600 disabled:opacity-50 mt-2 shadow-md">
                {isUploading ? "⏳ กำลังอัปโหลดรูปภาพและบันทึกสูตร..." : "✅ บันทึกสูตรอาหาร"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- Modal ดูสูตร (พร้อมรูปภาพหลายรูป & ระบบคอมเมนต์) --- */}
      {selectedRecipe && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSelectedRecipe(null)}>
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-0 relative shadow-2xl" onClick={e => e.stopPropagation()}>
            <button onClick={() => setSelectedRecipe(null)} className="absolute top-4 right-4 bg-black/50 hover:bg-black/70 text-white rounded-full w-8 h-8 flex items-center justify-center z-10">✕</button>
            
            {/* 🖼️ แกลอรี่รูปภาพ เลื่อนดูแนวนอนได้ */}
            <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide">
              {(selectedRecipe.images?.length > 0 ? selectedRecipe.images : [selectedRecipe.image]).map((img, i) => (
                <img key={i} src={img} className="w-full h-72 object-cover flex-shrink-0 snap-center" />
              ))}
            </div>
            
            <div className="p-8">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-3xl font-extrabold text-gray-800">{selectedRecipe.title}</h2>
                  <p className="text-sm text-gray-500 mt-2 flex items-center">
                    <span className="mr-3">👨‍🍳 โดย {selectedRecipe.author}</span>
                    <span className="bg-gray-100 px-2 py-1 rounded-md text-xs font-bold">{selectedRecipe.isPublic !== false ? "🌍 สาธารณะ" : "🔒 ส่วนตัว"}</span>
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <button onClick={(e) => handleLike(e, selectedRecipe)} className={`flex items-center space-x-1 px-4 py-2 rounded-full font-bold transition-colors ${selectedRecipe.likedBy?.includes(currentUser?.uid) ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-500'}`}>
                    <span>{selectedRecipe.likedBy?.includes(currentUser?.uid) ? '❤️' : '🤍'}</span>
                    <span>{selectedRecipe.likedBy?.length || 0}</span>
                  </button>
                </div>
              </div>
              
              <div className="bg-orange-50 p-6 rounded-2xl mb-4 border border-orange-100">
                <h4 className="font-bold text-orange-800 mb-3 flex items-center"><span className="mr-2 text-xl">🍳</span> วัตถุดิบ</h4>
                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{selectedRecipe.ingredients}</p>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm mb-8">
                <h4 className="font-bold text-gray-800 mb-3 flex items-center"><span className="mr-2 text-xl">🥣</span> วิธีทำ</h4>
                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{selectedRecipe.instructions}</p>
              </div>

              {/* 💬 --- ระบบคอมเมนต์ --- */}
              <div className="border-t border-gray-100 pt-8">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center text-lg">
                  <span className="mr-2">💬</span> ความคิดเห็น ({selectedRecipe.comments?.length || 0})
                </h3>
                
                {/* 📝 กล่องพิมพ์คอมเมนต์ (ซ่อนถ้าเป็น Guest) */}
                {!currentUser?.isAnonymous ? (
                  <form onSubmit={(e) => handleAddComment(e, selectedRecipe.id)} className="flex items-start space-x-3 mb-6">
                    <img src={currentUser?.photoURL || "https://www.svgrepo.com/show/529259/user-circle.svg"} className="w-10 h-10 rounded-full object-cover border border-gray-200" />
                    <div className="flex-1 flex bg-gray-50 border border-gray-200 rounded-2xl overflow-hidden focus-within:border-orange-300 focus-within:ring-2 focus-within:ring-orange-100 transition-all">
                      <input 
                        type="text" 
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder="เพิ่มความคิดเห็น..." 
                        className="flex-1 bg-transparent py-3 px-4 outline-none text-sm text-gray-700" 
                      />
                      <button type="submit" disabled={!commentText.trim()} className="px-4 text-orange-500 font-bold disabled:text-gray-300 hover:bg-orange-50 transition-colors">ส่ง</button>
                    </div>
                  </form>
                ) : (
                  <div className="bg-gray-50 text-center py-4 rounded-xl text-sm text-gray-500 mb-6 border border-gray-100">
                    โปรดล็อกอินด้วย Google เพื่อแสดงความคิดเห็น 🧑‍🍳
                  </div>
                )}

                {/* 📜 รายการคอมเมนต์ */}
                <div className="space-y-4">
                  {selectedRecipe.comments?.slice().reverse().map((c) => (
                    <div key={c.id} className="flex space-x-3">
                      <img src={c.photoURL} className="w-8 h-8 rounded-full object-cover border border-gray-100 flex-shrink-0" />
                      <div className="bg-gray-50 rounded-2xl rounded-tl-none px-4 py-2 border border-gray-100">
                        <p className="text-xs font-bold text-gray-700 mb-1">{c.author}</p>
                        <p className="text-sm text-gray-600">{c.text}</p>
                      </div>
                    </div>
                  ))}
                  {(!selectedRecipe.comments || selectedRecipe.comments.length === 0) && (
                    <p className="text-center text-gray-400 text-sm py-4">ยังไม่มีความคิดเห็น มาเป็นคนแรกที่รีวิวกันเถอะ!</p>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;