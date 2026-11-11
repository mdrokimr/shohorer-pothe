Mixamo FBX -> গেমের glTF (Python 3, numpy, Pillow)
1. python3 extract_tex.py           (FBX-এর ভিতরের PNG টেক্সচার বের করে)
2. python3 convert.py character.fbx x  (মেশ, হাড়, ওজন পড়ে scene.pkl বানায়)
3. python3 build_gltf.py player.gltf.json 1024   (glTF + JPG/PNG টেক্সচার)
4. python3 mask.py                  (জামা-প্যান্ট-শরীরের মাস্ক)
এখনকার স্ক্রিপ্ট Ch31 চরিত্রের টেক্সচার-নাম ধরে লেখা; নতুন চরিত্রে নাম মিলিয়ে নিতে হবে।
