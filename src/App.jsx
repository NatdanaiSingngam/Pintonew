import React, { useState, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import { db } from './firebase'; 
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove, deleteDoc } from 'firebase/firestore';

// 🔑 API Key ของนายครับ!
const IMGBB_API_KEY = "b71476387444bc1fda933927fa2e82e9";

function App() {
  const { currentUser, loginWithGoogle, logout } = useAuth();
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [recipes, setRecipes] = useState([]);
  
  const [formData, setFormData] = useState({ title: '', ingredients: '', instructions: '' });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  // 👇 1. เพิ่ม State สำหรับเก็บคำค้นหา
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const q = query(collection(db, "recipes"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const recipesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRecipes(recipesData);
    });
    return () => unsubscribe(); 
  }, []);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmitRecipe = async (e) => {
    e.preventDefault(); 
    if (!formData.title || !imageFile) {
      alert("กรุณากรอกชื่อเมนูและเลือกรูปภาพด้วยนะครับ 🍳");
      return;
    }

    setIsUploading(true);

    try {
      const imageFormData = new FormData();
      imageFormData.append("image", imageFile);

      const imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: "POST",
        body: imageFormData
      });
      const imgbbData = await imgbbRes.json();
      if (!imgbbData.success) throw new Error("อัปโหลดรูปภาพไม่สำเร็จ");

      const imageUrl = imgbbData.data.url; 

      await addDoc(collection(db, "recipes"), {
        title: formData.title,
        image: imageUrl,
        ingredients: formData.ingredients,
        instructions: formData.instructions,
        author: currentUser?.displayName || "เชฟนิรนาม", 
        authorId: currentUser?.uid,
        likedBy: [], 
        createdAt: serverTimestamp() 
      });

      alert("🎉 บันทึกสูตรอาหารสำเร็จ!");
      setIsCreating(false); 
      setFormData({ title: '', ingredients: '', instructions: '' }); 
      setImageFile(null);
      setImagePreview(null);
    } catch (error) {
      console.error("Error adding document: ", error);
      alert("เกิดข้อผิดพลาด: " + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleLike = async (e, recipe) => {
    e.stopPropagation(); 
    const uid = currentUser?.uid;
    if (!uid) return; 

    const recipeRef = doc(db, "recipes", recipe.id);
    const hasLiked = recipe.likedBy && recipe.likedBy.includes(uid);

    try {
      if (hasLiked) {
        await updateDoc(recipeRef, { likedBy: arrayRemove(uid) });
      } else {
        await updateDoc(recipeRef, { likedBy: arrayUnion(uid) });
      }
    } catch (error) {
      console.error("Error liking recipe: ", error);
      alert("เกิดข้อผิดพลาดในการกดไลก์ครับ");
    }
  };

  const handleDeleteRecipe = async (recipeId) => {
    if (window.confirm("แน่ใจนะว่าจะลบสูตรอาหารนี้? ลบแล้วกู้คืนไม่ได้น้า 🥺")) {
      try {
        await deleteDoc(doc(db, "recipes", recipeId));
        setSelectedRecipe(null); 
        alert("🗑️ ลบสูตรอาหารเรียบร้อยแล้วครับ");
      } catch (error) {
        console.error("Error deleting document: ", error);
        alert("เกิดข้อผิดพลาดในการลบครับ");
      }
    }
  };

  const activeRecipe = selectedRecipe ? recipes.find(r => r.id === selectedRecipe.id) : null;

  // 👇 2. กรองข้อมูลสูตรอาหาร ตามคำค้นหาที่พิมพ์
  const filteredRecipes = recipes.filter((recipe) => {
    // เอาคำค้นหาไปแปลงเป็นพิมพ์เล็กให้หมด จะได้ค้นหาง่ายขึ้น
    const searchLower = searchQuery.toLowerCase();
    
    // ค้นหาจากชื่อเมนู หรือ ส่วนผสม
    const matchTitle = recipe.title?.toLowerCase().includes(searchLower);
    const matchIngredients = recipe.ingredients?.toLowerCase().includes(searchLower);
    
    return matchTitle || matchIngredients;
  });

  return (
    <div className="min-h-screen bg-gray-50 relative">
      {/* --- Top Navbar --- */}
      <nav className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex-shrink-0 flex items-center">
              <h1 className="text-3xl font-extrabold text-orange-500 tracking-tight cursor-pointer">Pinto</h1>
            </div>
            
            {/* 👇 3. ผูกช่อง Search เข้ากับ State searchQuery */}
            <div className="flex-1 max-w-xl mx-8 hidden sm:block">
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="ค้นหาสูตรอาหาร หรือส่วนผสม (เช่น หมูสามชั้น)..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-gray-100 rounded-full py-2 px-5 focus:outline-none focus:ring-2 focus:ring-orange-300 transition-all" 
                />
                {/* ปุ่มกากบาทล้างคำค้นหา (โชว์เมื่อมีการพิมพ์) */}
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery("")}
                    className="absolute right-4 top-2 text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <button onClick={() => setIsCreating(true)} className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2 rounded-full font-medium transition-colors shadow-sm">
                + สร้างสูตร
              </button>
              
              <div className="flex items-center space-x-2">
                {currentUser?.isAnonymous ? (
                  <button onClick={loginWithGoogle} className="flex items-center space-x-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-full text-sm font-medium transition-colors shadow-sm">
                    <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-4 h-4" />
                    <span>ล็อกอิน / สมัครสมาชิก</span>
                  </button>
                ) : (
                  <div className="flex items-center space-x-3">
                    <span className="text-sm text-gray-700 font-medium hidden sm:block">สวัสดี, {currentUser?.displayName?.split(' ')[0] || 'เชฟ'}!</span>
                    <img src={currentUser?.photoURL || "https://via.placeholder.com/40"} alt="Profile" onClick={logout} className="w-10 h-10 rounded-full border-2 border-orange-200 shadow-sm cursor-pointer hover:ring-2 hover:ring-red-400" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* --- Main Content --- */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">
            {searchQuery ? `ผลการค้นหาสำหรับ: "${searchQuery}"` : "เมนูเด็ดของ Pinto 🍱"}
          </h2>
        </div>

        {/* แสดงข้อความถ้าไม่มีข้อมูล */}
        {recipes.length === 0 ? (
          <div className="text-center py-20 text-gray-500">ยังไม่มีสูตรอาหารเลยครับ มาเป็นเชฟคนแรกของ Pinto กันเถอะ! 🍳</div>
        ) : filteredRecipes.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <span className="text-4xl block mb-4">🔍</span>
            ไม่พบสูตรอาหารที่ตรงกับ "{searchQuery}" ลองค้นหาด้วยคำอื่นดูนะครับ
          </div>
        ) : (
          <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
            {/* 👇 4. เปลี่ยนมาวนลูปจาก filteredRecipes แทน recipes เฉยๆ */}
            {filteredRecipes.map((recipe) => {
              const isLikedByMe = recipe.likedBy && recipe.likedBy.includes(currentUser?.uid);
              const likeCount = recipe.likedBy ? recipe.likedBy.length : 0;

              return (
                <div key={recipe.id} onClick={() => setSelectedRecipe(recipe)} className="bg-white rounded-2xl shadow-sm overflow-hidden break-inside-avoid hover:shadow-md transition-shadow cursor-pointer group">
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
                    <h3 className="font-bold text-gray-800 line-clamp-2 mb-2">{recipe.title}</h3>
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center space-x-2">
                        <div className="w-6 h-6 bg-orange-200 rounded-full flex items-center justify-center text-xs font-bold text-orange-600">
                          {recipe.author ? recipe.author[0] : 'U'}
                        </div>
                        <span className="text-xs text-gray-500">{recipe.author}</span>
                      </div>
                      
                      <button 
                        onClick={(e) => handleLike(e, recipe)}
                        className={`flex items-center text-xs px-2 py-1 rounded-full transition-colors border border-transparent 
                          ${isLikedByMe ? 'text-red-500 bg-red-50' : 'text-gray-500 bg-gray-50 hover:text-red-500 hover:bg-red-50'}`}
                      >
                        {isLikedByMe ? '❤️' : '🤍'} {likeCount}
                      </button>

                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* --- Popup ดูสูตร --- */}
      {activeRecipe && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl relative">
            <button onClick={() => setSelectedRecipe(null)} className="absolute top-4 right-4 bg-black/50 hover:bg-black/70 text-white rounded-full w-8 h-8 flex items-center justify-center z-10">✕</button>
            <img src={activeRecipe.image} alt={activeRecipe.title} className="w-full h-72 object-cover" />
            <div className="p-6">
              
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-3xl font-bold text-gray-800">{activeRecipe.title}</h2>
                
                <div className="flex items-center space-x-2">
                  {currentUser?.uid === activeRecipe.authorId && (
                    <button 
                      onClick={() => handleDeleteRecipe(activeRecipe.id)}
                      className="flex items-center space-x-1 px-4 py-2 rounded-full font-bold bg-gray-100 text-gray-500 hover:bg-red-500 hover:text-white transition-colors shadow-sm"
                    >
                      <span>🗑️ ลบ</span>
                    </button>
                  )}

                  {(() => {
                    const isLikedByMe = activeRecipe.likedBy && activeRecipe.likedBy.includes(currentUser?.uid);
                    const likeCount = activeRecipe.likedBy ? activeRecipe.likedBy.length : 0;
                    
                    return (
                      <button 
                        onClick={(e) => handleLike(e, activeRecipe)}
                        className={`flex items-center space-x-1 px-4 py-2 rounded-full font-bold transition-colors shadow-sm
                          ${isLikedByMe ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-500'}`}
                      >
                        <span>{isLikedByMe ? '❤️' : '🤍'}</span>
                        <span>{likeCount}</span>
                      </button>
                    );
                  })()}
                </div>
              </div>

              <div className="flex items-center space-x-4 mb-6 pb-6 border-b border-gray-100">
                <div className="w-10 h-10 bg-orange-200 rounded-full flex items-center justify-center font-bold text-orange-600">
                  {activeRecipe.author ? activeRecipe.author[0] : 'U'}
                </div>
                <div>
                  <p className="font-medium text-gray-800">{activeRecipe.author}</p>
                </div>
              </div>
              <div className="bg-orange-50 rounded-2xl p-6 border border-orange-100 mb-4">
                <h3 className="font-bold text-orange-800 mb-2">วัตถุดิบ 🥚</h3>
                <p className="text-gray-700 whitespace-pre-wrap">{activeRecipe.ingredients || "ไม่ได้ระบุวัตถุดิบ"}</p>
              </div>
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <h3 className="font-bold text-gray-800 mb-2">วิธีทำ 🍳</h3>
                <p className="text-gray-700 whitespace-pre-wrap">{activeRecipe.instructions || "ไม่ได้ระบุวิธีทำ"}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- Popup สร้างสูตร (เหมือนเดิม) --- */}
      {isCreating && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 relative">
            <button onClick={() => setIsCreating(false)} disabled={isUploading} className="absolute top-4 right-4 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-full w-8 h-8 flex items-center justify-center z-10 disabled:opacity-50">✕</button>
            <h2 className="text-2xl font-bold text-gray-800 mb-6">🍳 สร้างสูตรอาหารใหม่</h2>
            
            <form className="space-y-4" onSubmit={handleSubmitRecipe}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">รูปภาพอาหาร</label>
                {imagePreview && (
                  <div className="mb-3 relative rounded-xl overflow-hidden h-48 bg-gray-100 border border-gray-200">
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); }} className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 w-8 h-8 flex items-center justify-center hover:bg-red-600">✕</button>
                  </div>
                )}
                <input type="file" accept="image/*" onChange={handleImageChange} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 cursor-pointer border border-gray-300 rounded-xl p-2" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อเมนู</label>
                <input type="text" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} className="w-full border border-gray-300 rounded-xl py-2 px-4 focus:ring-2 focus:ring-orange-300" placeholder="เช่น กะเพราหมูสับไข่ดาว" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ส่วนผสม</label>
                <textarea value={formData.ingredients} onChange={(e) => setFormData({...formData, ingredients: e.target.value})} rows="3" className="w-full border border-gray-300 rounded-xl py-2 px-4 focus:ring-2 focus:ring-orange-300" placeholder="หมูสับ, ใบกะเพรา..."></textarea>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">วิธีทำ</label>
                <textarea value={formData.instructions} onChange={(e) => setFormData({...formData, instructions: e.target.value})} rows="4" className="w-full border border-gray-300 rounded-xl py-2 px-4 focus:ring-2 focus:ring-orange-300" placeholder="1. ตั้งกระทะ..."></textarea>
              </div>
              <div className="pt-4 border-t border-gray-100 flex justify-end space-x-3 mt-6">
                <button type="button" onClick={() => setIsCreating(false)} disabled={isUploading} className="px-5 py-2 rounded-full font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50">ยกเลิก</button>
                <button type="submit" disabled={isUploading} className="px-5 py-2 rounded-full font-medium text-white bg-orange-500 hover:bg-orange-600 shadow-sm disabled:opacity-70 disabled:cursor-not-allowed flex items-center">
                  {isUploading ? "⏳ กำลังอัปโหลด..." : "บันทึกสูตร"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
    </div>
  );
}

export default App;