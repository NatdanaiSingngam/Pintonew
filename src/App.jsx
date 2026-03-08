import React, { useState, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import { db } from './firebase'; 
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove, deleteDoc, where } from 'firebase/firestore';

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
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [recipes, setRecipes] = useState([]);
  
  const [formData, setFormData] = useState({ title: '', ingredients: '', instructions: '', isPublic: true });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState("all");

  useEffect(() => {
    // ดึงข้อมูลทั้งหมดมาจัดการ Filter ที่ Client-side เพื่อความรวดเร็วในการสลับแท็บ
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
      const imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: imageFormData });
      const imgbbData = await imgbbRes.json();
      if (!imgbbData.success) throw new Error("อัปโหลดรูปภาพไม่สำเร็จ");
      const imageUrl = imgbbData.data.url; 

      await addDoc(collection(db, "recipes"), {
        title: formData.title,
        image: imageUrl,
        ingredients: formData.ingredients,
        instructions: formData.instructions,
        isPublic: formData.isPublic, // เก็บสถานะ Public/Private
        author: currentUser?.isAnonymous ? "เชฟนิรนาม (Guest)" : (currentUser?.displayName || "เชฟนิรนาม"), 
        authorId: currentUser?.uid,
        likedBy: [], 
        createdAt: serverTimestamp() 
      });
      alert("🎉 บันทึกสูตรอาหารสำเร็จ!");
      setIsCreating(false); 
      setFormData({ title: '', ingredients: '', instructions: '', isPublic: true }); 
      setImageFile(null);
      setImagePreview(null);
      setFilterTab(formData.isPublic ? "all" : "my_recipes"); 
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
    }
  };

  const handleDeleteRecipe = async (recipeId) => {
    if (window.confirm("แน่ใจนะว่าจะลบสูตรอาหารนี้?")) {
      try {
        await deleteDoc(doc(db, "recipes", recipeId));
        setSelectedRecipe(null); 
      } catch (error) {
        console.error("Error deleting document: ", error);
      }
    }
  };

  // 🔍 กรองข้อมูลตามเงื่อนไขที่นายต้องการ
  const filteredRecipes = recipes.filter((recipe) => {
    const isOwner = currentUser && recipe.authorId === currentUser.uid;
    const isPublic = recipe.isPublic === true;
    
    let passesTab = false;
    if (filterTab === "all") {
      // หน้าฟีดรวม: โชว์เฉพาะอันที่เป็น Public เท่านั้น (ไม่ว่าจะเป็นของใคร)
      passesTab = isPublic;
    } else if (filterTab === "my_recipes") {
      // หน้าสูตรของฉัน: โชว์ทุกอันที่เราเป็นเจ้าของ (ทั้ง Public และ Private)
      passesTab = isOwner;
    } else if (filterTab === "liked") {
      // หน้าที่ถูกใจ: โชว์อันที่เรากดไลก์ และต้องเป็นอันที่ยังเป็น Public อยู่ (ยกเว้นเราเป็นเจ้าของเอง)
      passesTab = currentUser && recipe.likedBy?.includes(currentUser.uid) && (isPublic || isOwner);
    }

    const searchLower = searchQuery.toLowerCase();
    const matchSearch = recipe.title?.toLowerCase().includes(searchLower) || recipe.ingredients?.toLowerCase().includes(searchLower);

    return passesTab && matchSearch;
  });

  return (
    <div className="min-h-screen bg-gray-50 relative">
      <nav className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex-shrink-0 flex items-center">
              <h1 className="text-3xl font-extrabold text-orange-500 tracking-tight cursor-pointer" onClick={() => setFilterTab("all")}>Pinto</h1>
            </div>
            
            <div className="flex-1 max-w-xl mx-8 hidden sm:block">
              <input 
                type="text" 
                placeholder="ค้นหาสูตรอาหาร..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-100 rounded-full py-2 px-5 focus:outline-none focus:ring-2 focus:ring-orange-300" 
              />
            </div>
            
            <div className="flex items-center space-x-4">
              <button onClick={() => setIsCreating(true)} className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2 rounded-full font-medium transition-colors">
                + สร้างสูตร
              </button>
              
              <div>
                {currentUser?.isAnonymous ? (
                  <button onClick={loginWithGoogle} className="flex items-center space-x-2 bg-white border border-gray-300 px-4 py-2 rounded-full text-sm font-medium hover:bg-gray-50">
                    <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="G" className="w-4 h-4" />
                    <span>ล็อกอิน</span>
                  </button>
                ) : (
                  <img src={currentUser?.photoURL} alt="P" onClick={logout} className="w-10 h-10 rounded-full border-2 border-orange-200 cursor-pointer hover:opacity-80" title="ออกจากระบบ" />
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* แท็บเมนู */}
        <div className="flex space-x-3 mb-8 overflow-x-auto pb-2 scrollbar-hide">
          <button onClick={() => setFilterTab('all')} className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${filterTab === 'all' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 border'}`}>🌐 ฟีดรวม</button>
          <button onClick={() => setFilterTab('my_recipes')} className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${filterTab === 'my_recipes' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 border'}`}>🍳 สูตรของฉัน</button>
          <button onClick={() => setFilterTab('liked')} className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${filterTab === 'liked' ? 'bg-red-500 text-white' : 'bg-white text-gray-600 border'}`}>❤️ ที่ถูกใจ</button>
        </div>

        <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
          {filteredRecipes.map((recipe) => (
            <div key={recipe.id} onClick={() => setSelectedRecipe(recipe)} className="bg-white rounded-2xl shadow-sm overflow-hidden break-inside-avoid hover:shadow-md transition-shadow cursor-pointer border relative group">
              {!recipe.isPublic && (
                <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-full backdrop-blur-sm z-10">🔒 ส่วนตัว</div>
              )}
              <img src={recipe.image} alt={recipe.title} className="w-full h-auto object-cover" />
              <div className="p-4">
                <h3 className="font-bold text-gray-800 line-clamp-2">{recipe.title}</h3>
                <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
                  <span>{recipe.author}</span>
                  <button onClick={(e) => handleLike(e, recipe)} className={recipe.likedBy?.includes(currentUser?.uid) ? 'text-red-500' : 'text-gray-400'}>
                    {recipe.likedBy?.includes(currentUser?.uid) ? '❤️' : '🤍'} {recipe.likedBy?.length || 0}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* --- Popup สร้างสูตร (เพิ่มตัวเลือก Public/Private) --- */}
      {isCreating && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-xl p-6 relative shadow-2xl">
            <button onClick={() => setIsCreating(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">✕</button>
            <h2 className="text-xl font-bold mb-6">จดสูตรอาหารใหม่ ✍️</h2>
            <form onSubmit={handleSubmitRecipe} className="space-y-4">
              {imagePreview && <img src={imagePreview} className="w-full h-40 object-cover rounded-xl border" />}
              <input type="file" accept="image/*" onChange={handleImageChange} className="w-full text-sm border p-2 rounded-xl" />
              <input type="text" placeholder="ชื่อเมนู" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-orange-300 outline-none" />
              <textarea placeholder="ส่วนผสม" value={formData.ingredients} onChange={(e) => setFormData({...formData, ingredients: e.target.value})} className="w-full border p-3 rounded-xl outline-none" rows="2"></textarea>
              <textarea placeholder="วิธีทำ" value={formData.instructions} onChange={(e) => setFormData({...formData, instructions: e.target.value})} className="w-full border p-3 rounded-xl outline-none" rows="3"></textarea>
              
              {/* 🔒 ส่วนเลือกความเป็นส่วนตัว */}
              <div className="flex items-center justify-between bg-gray-50 p-4 rounded-2xl border border-dashed border-gray-300">
                <div>
                  <p className="text-sm font-bold text-gray-700">การมองเห็น</p>
                  <p className="text-xs text-gray-500">{formData.isPublic ? "ทุกคนสามารถเห็นสูตรนี้ได้" : "เห็นได้เฉพาะคุณเท่านั้น"}</p>
                </div>
                <div 
                  onClick={() => setFormData({...formData, isPublic: !formData.isPublic})}
                  className={`w-14 h-8 flex items-center rounded-full p-1 cursor-pointer transition-colors ${formData.isPublic ? 'bg-green-500' : 'bg-gray-400'}`}
                >
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

      {/* --- Popup ดูสูตร --- */}
      {selectedRecipe && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSelectedRecipe(null)}>
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-0 relative" onClick={e => e.stopPropagation()}>
            <img src={selectedRecipe.image} className="w-full h-64 object-cover" />
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-2xl font-bold">{selectedRecipe.title}</h2>
                {currentUser?.uid === selectedRecipe.authorId && (
                  <button onClick={() => handleDeleteRecipe(selectedRecipe.id)} className="text-red-500 text-sm font-bold border border-red-200 px-3 py-1 rounded-full hover:bg-red-50">ลบสูตร</button>
                )}
              </div>
              <p className="text-sm text-gray-500 mb-6">โดย {selectedRecipe.author} {selectedRecipe.isPublic ? "🌍 สาธารณะ" : "🔒 ส่วนตัว"}</p>
              <div className="bg-orange-50 p-4 rounded-xl mb-4">
                <h4 className="font-bold text-orange-800 mb-2">วัตถุดิบ</h4>
                <p className="text-gray-700 whitespace-pre-wrap">{selectedRecipe.ingredients}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl">
                <h4 className="font-bold text-gray-800 mb-2">วิธีทำ</h4>
                <p className="text-gray-700 whitespace-pre-wrap">{selectedRecipe.instructions}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;