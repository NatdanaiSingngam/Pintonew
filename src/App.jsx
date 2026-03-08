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

  // 🍳 ข้อมูลฟอร์มสร้างสูตร
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

  // 📸 ฟังก์ชันจัดการรูปโปรไฟล์
  const handleProfileImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setProfileImageFile(file);
      setNewPhotoURL(URL.createObjectURL(file)); 
    }
  };

  // 💾 ฟังก์ชันบันทึกโปรไฟล์ใหม่
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
      alert("เกิดข้อผิดพลาดในการบันทึกโปรไฟล์");
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
        author: currentUser?.isAnonymous ? "เชฟนิรนาม (Guest)" : (currentUser?.displayName || "เชฟนิรนาม"), 
        authorId: currentUser?.uid,
        likedBy: [], 
        createdAt: serverTimestamp() 
      });
      setIsCreating(false); 
      setFormData({ title: '', ingredients: '', instructions: '', isPublic: true }); 
      setImageFile(null);
      setImagePreview(null);
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
      } catch (error) {
        console.error("Error deleting document: ", error);
      }
    }
  };

  // 🔍 ระบบกรองข้อมูล (Tabs + Search)
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

  const activeRecipe = selectedRecipe ? recipes.find(r => r.id === selectedRecipe.id) : null;

  return (
    <div className="min-h-screen bg-gray-50 font-sans relative">
      {/* --- Top Navbar --- */}
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
            
            {/* 🔑 เช็คสถานะการล็อกอิน */}
            {currentUser?.isAnonymous ? (
              <button 
                onClick={loginWithGoogle} 
                className="flex items-center space-x-2 bg-white border border-gray-200 px-4 py-2 rounded-full text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all shadow-sm"
              >
                <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="G" className="w-4 h-4" />
                <span>ล็อกอิน / สมัคร</span>
              </button>
            ) : (
              <div className="relative">
                <div 
                  className="w-10 h-10 rounded-full border-2 border-orange-200 cursor-pointer overflow-hidden bg-gray-100 shadow-sm hover:ring-2 hover:ring-orange-300 transition-all"
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                >
                  <img src={currentUser?.photoURL || "https://www.svgrepo.com/show/529259/user-circle.svg"} alt="P" className="w-full h-full object-cover" />
                </div>

                {showProfileMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50">
                    <div className="px-4 py-2 border-b border-gray-50 mb-1">
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">บัญชีของคุณ</p>
                      <p className="text-sm font-bold text-gray-700 truncate">{currentUser?.displayName || "เชฟนิรนาม"}</p>
                    </div>
                    <button 
                      onClick={() => {
                        setNewDisplayName(currentUser?.displayName || "");
                        setNewPhotoURL(currentUser?.photoURL || "");
                        setIsEditingProfile(true);
                        setShowProfileMenu(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 flex items-center transition-colors"
                    >
                      <span className="mr-2">📝</span> แก้ไขโปรไฟล์
                    </button>
                    <button 
                      onClick={() => { logout(); setShowProfileMenu(false); }}
                      className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 flex items-center transition-colors"
                    >
                      <span className="mr-2">🚪</span> ออกจากระบบ
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* --- Main Content --- */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex space-x-3 mb-8 overflow-x-auto pb-2 scrollbar-hide">
          <button onClick={() => setFilterTab('all')} className={`px-5 py-2.5 rounded-full text-sm font-bold border transition-all ${filterTab === 'all' ? 'bg-gray-800 text-white border-gray-800 shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'}`}>🌐 ฟีดรวม</button>
          <button onClick={() => setFilterTab('my_recipes')} className={`px-5 py-2.5 rounded-full text-sm font-bold border transition-all ${filterTab === 'my_recipes' ? 'bg-orange-500 text-white border-orange-500 shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'}`}>🍳 สูตรของฉัน</button>
          <button onClick={() => setFilterTab('liked')} className={`px-5 py-2.5 rounded-full text-sm font-bold border transition-all ${filterTab === 'liked' ? 'bg-red-500 text-white border-red-500 shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'}`}>❤️ ที่ถูกใจ</button>
        </div>

        {filteredRecipes.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
             <span className="text-4xl block mb-4">🔍</span>
             ไม่พบสูตรอาหารในหมวดหมู่นี้ ลองค้นหาหรือเพิ่มสูตรใหม่ดูสิครับ!
          </div>
        ) : (
          <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
            {filteredRecipes.map((recipe) => (
              <div key={recipe.id} onClick={() => setSelectedRecipe(recipe)} className="bg-white rounded-2xl shadow-sm overflow-hidden break-inside-avoid border border-gray-100 relative group cursor-pointer hover:shadow-md transition-shadow">
                {recipe.isPublic === false && <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-full z-10 backdrop-blur-sm">🔒 ส่วนตัว</div>}
                
                <div className="w-full bg-gray-200 overflow-hidden relative">
                   <img src={recipe.image} alt={recipe.title} className="w-full h-auto object-cover group-hover:scale-105 transition-transform duration-300" />
                   {currentUser?.uid === recipe.authorId && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDeleteRecipe(recipe.id); }}
                        className="absolute top-2 right-2 bg-black/40 hover:bg-red-500 text-white p-1.5 rounded-full transition-colors backdrop-blur-sm opacity-0 group-hover:opacity-100"
                        title="ลบสูตรนี้"
                      >
                        🗑️
                      </button>
                    )}
                </div>

                <div className="p-4">
                  <h3 className="font-bold text-gray-800 line-clamp-2">{recipe.title}</h3>
                  <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
                    <div className="flex items-center space-x-1">
                      <div className="w-5 h-5 bg-orange-100 rounded-full flex items-center justify-center text-[10px] font-bold text-orange-600">{recipe.author?.[0] || 'U'}</div>
                      <span className="truncate max-w-[80px]">{recipe.author}</span>
                    </div>
                    <button onClick={(e) => handleLike(e, recipe)} className={`flex items-center space-x-1 px-2 py-1 rounded-full transition-colors ${recipe.likedBy?.includes(currentUser?.uid) ? 'text-red-500 bg-red-50' : 'text-gray-400 bg-gray-50 hover:bg-red-50 hover:text-red-500'}`}>
                      <span>{recipe.likedBy?.includes(currentUser?.uid) ? '❤️' : '🤍'}</span>
                      <span>{recipe.likedBy?.length || 0}</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* --- Modal แก้ไขโปรไฟล์ --- */}
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
                <input 
                  type="text" 
                  value={newDisplayName} 
                  onChange={(e) => setNewDisplayName(e.target.value)} 
                  className="w-full border-2 border-gray-100 bg-gray-50 rounded-2xl py-3 px-4 outline-none focus:border-orange-300" 
                  placeholder="ใส่ชื่อเชฟของคุณ..."
                />
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

      {/* --- Modal สร้างสูตร --- */}
      {isCreating && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-xl p-6 relative shadow-2xl overflow-y-auto max-h-[90vh]">
            <button onClick={() => setIsCreating(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">✕</button>
            <h2 className="text-xl font-bold mb-6">จดสูตรอาหารใหม่ ✍️</h2>
            <form onSubmit={handleSubmitRecipe} className="space-y-4">
              {imagePreview && <img src={imagePreview} className="w-full h-48 object-cover rounded-xl border" />}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">รูปภาพอาหาร</label>
                <input type="file" accept="image/*" onChange={handleImageChange} className="w-full text-sm border p-2 rounded-xl bg-gray-50" />
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
              
              <div className="flex items-center justify-between bg-gray-50 p-4 rounded-2xl border border-dashed border-gray-300">
                <div>
                  <p className="text-sm font-bold text-gray-700">แชร์สาธารณะ</p>
                  <p className="text-[10px] text-gray-500">เปิดเพื่อให้คนอื่นเห็นสูตรนี้ในฟีดรวมได้</p>
                </div>
                <div onClick={() => setFormData({...formData, isPublic: !formData.isPublic})} className={`w-14 h-8 flex items-center rounded-full p-1 cursor-pointer transition-colors ${formData.isPublic ? 'bg-green-500' : 'bg-gray-400'}`}>
                  <div className={`bg-white w-6 h-6 rounded-full shadow-md transform transition-transform ${formData.isPublic ? 'translate-x-6' : ''}`}></div>
                </div>
              </div>
              
              <button type="submit" disabled={isUploading} className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold hover:bg-orange-600 disabled:opacity-50 mt-2 shadow-md">
                {isUploading ? "⏳ กำลังบันทึกสูตร..." : "✅ บันทึกสูตรอาหาร"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- Modal ดูสูตร (พร้อม AI แนะนำ) --- */}
      {activeRecipe && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSelectedRecipe(null)}>
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-0 relative shadow-2xl" onClick={e => e.stopPropagation()}>
            <button onClick={() => setSelectedRecipe(null)} className="absolute top-4 right-4 bg-black/50 hover:bg-black/70 text-white rounded-full w-8 h-8 flex items-center justify-center z-10">✕</button>
            <img src={activeRecipe.image} className="w-full h-72 object-cover" />
            
            <div className="p-8">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-3xl font-extrabold text-gray-800">{activeRecipe.title}</h2>
                  <p className="text-sm text-gray-500 mt-2 flex items-center">
                    <span className="mr-3">👨‍🍳 โดย {activeRecipe.author}</span>
                    <span className="bg-gray-100 px-2 py-1 rounded-md text-xs font-bold">{activeRecipe.isPublic !== false ? "🌍 สาธารณะ" : "🔒 ส่วนตัว"}</span>
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  {currentUser?.uid === activeRecipe.authorId && (
                    <button onClick={() => { if(window.confirm("ลบสูตรนี้ใช่ไหม?")) { deleteDoc(doc(db, "recipes", activeRecipe.id)); setSelectedRecipe(null); }}} className="text-red-500 text-sm font-bold bg-red-50 px-4 py-2 rounded-full hover:bg-red-100 transition-colors">🗑️ ลบ</button>
                  )}
                  <button 
                    onClick={(e) => handleLike(e, activeRecipe)}
                    className={`flex items-center space-x-1 px-4 py-2 rounded-full font-bold transition-colors ${activeRecipe.likedBy?.includes(currentUser?.uid) ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-500'}`}
                  >
                    <span>{activeRecipe.likedBy?.includes(currentUser?.uid) ? '❤️' : '🤍'}</span>
                    <span>{activeRecipe.likedBy?.length || 0}</span>
                  </button>
                </div>
              </div>
              
              <div className="bg-orange-50 p-6 rounded-2xl mb-4 border border-orange-100">
                <h4 className="font-bold text-orange-800 mb-3 flex items-center"><span className="mr-2 text-xl">🍳</span> วัตถุดิบ</h4>
                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{activeRecipe.ingredients}</p>
              </div>
              
              <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <h4 className="font-bold text-gray-800 mb-3 flex items-center"><span className="mr-2 text-xl">🥣</span> วิธีทำ</h4>
                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{activeRecipe.instructions}</p>
              </div>

              {/* 🧠 AI Recommendation Section */}
              {(() => {
                const activeTf = getTermFrequency((activeRecipe.ingredients || "") + " " + (activeRecipe.title || ""));
                const recommended = recipes
                  .filter(r => r.id !== activeRecipe.id && r.isPublic !== false) // แนะนำเฉพาะที่เป็น Public
                  .map(r => {
                    const rTf = getTermFrequency((r.ingredients || "") + " " + (r.title || ""));
                    return { ...r, similarityScore: calculateCosineSimilarity(activeTf, rTf) };
                  })
                  .filter(r => r.similarityScore > 0.05) 
                  .sort((a, b) => b.similarityScore - a.similarityScore)
                  .slice(0, 4); 

                if (recommended.length === 0) return null;

                return (
                  <div className="mt-8 pt-6 border-t border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center">
                      <span className="mr-2 text-xl">✨</span> เมนูที่คล้ายกัน (แนะนำสำหรับคุณ)
                    </h3>
                    <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                      {recommended.map(rec => (
                        <div 
                          key={rec.id} 
                          onClick={(e) => { e.stopPropagation(); setSelectedRecipe(rec); }}
                          className="min-w-[140px] w-[140px] cursor-pointer group"
                        >
                          <div className="h-24 w-full rounded-xl overflow-hidden mb-2 relative border border-gray-200 shadow-sm">
                            <img src={rec.image} alt={rec.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                            <div className="absolute top-1 right-1 bg-white/95 px-1.5 py-0.5 rounded text-[10px] font-bold text-orange-600 shadow-sm">
                              เหมือน {(rec.similarityScore * 100).toFixed(0)}%
                            </div>
                          </div>
                          <h4 className="text-sm font-bold text-gray-700 line-clamp-2 group-hover:text-orange-500">{rec.title}</h4>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;