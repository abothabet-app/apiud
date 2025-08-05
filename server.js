const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// إعداد الجلسات
app.use(session({
    secret: process.env.SESSION_SECRET || 'image-upload-secret-key-2024-sultan-private-app',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // تعيين إلى true في الإنتاج مع HTTPS
        maxAge: 24 * 60 * 60 * 1000, // 24 ساعة
        httpOnly: true // منع الوصول للجلسة عبر JavaScript
    }
}));

// معالجة البيانات JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// بيانات المستخدمين (في تطبيق حقيقي، استخدم قاعدة بيانات)
const users = [
    {
        id: 1,
        username: 'admin',
        password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi' // admin123
    },
    {
        id: 2,
        username: 'sultan',
        password: '$2b$10$N8YonNzSoG6pu8sWyeB0suxxtrocwRmREf.5VPickNzGK3VNvwe5S' // sso@402426
    }
];

// وظيفة للتحقق من المصادقة
function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    } else {
        return res.redirect('/login');
    }
}

// إنشاء مجلد الصور إذا لم يكن موجوداً
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// إعداد multer لحفظ الصور
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        // إنشاء اسم فريد للملف
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

// فلترة الملفات للسماح بالصور فقط
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('نوع الملف غير مدعوم. يرجى رفع صور فقط (JPEG, PNG, GIF, WebP)'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // حد أقصى 5 ميجابايت
    }
});

// تقديم الملفات الثابتة
app.use('/uploads', express.static('uploads'));
app.use(express.static('public'));

// صفحة تسجيل الدخول
app.get('/login', (req, res) => {
    if (req.session && req.session.userId) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// معالجة تسجيل الدخول
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'يرجى إدخال اسم المستخدم وكلمة المرور'
            });
        }

        // البحث عن المستخدم
        const user = users.find(u => u.username === username);
        if (!user) {
            // عدم الكشف عن سبب الفشل الدقيق لأسباب أمنية
            return res.status(401).json({
                success: false,
                message: 'بيانات تسجيل الدخول غير صحيحة'
            });
        }

        // التحقق من كلمة المرور
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'بيانات تسجيل الدخول غير صحيحة'
            });
        }

        // إنشاء جلسة
        req.session.userId = user.id;
        req.session.username = user.username;

        res.json({
            success: true,
            message: 'تم تسجيل الدخول بنجاح',
            user: {
                id: user.id,
                username: user.username
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم'
        });
    }
});

// تسجيل الخروج
app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'حدث خطأ أثناء تسجيل الخروج'
            });
        }
        res.json({
            success: true,
            message: 'تم تسجيل الخروج بنجاح'
        });
    });
});

// الصفحة الرئيسية (محمية)
app.get('/', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// رفع صورة واحدة (محمي)
app.post('/upload', requireAuth, upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                message: 'لم يتم اختيار أي ملف' 
            });
        }

        const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
        
        res.json({
            success: true,
            message: 'تم رفع الصورة بنجاح!',
            imageUrl: imageUrl,
            filename: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء رفع الصورة',
            error: error.message
        });
    }
});

// رفع عدة صور (محمي)
app.post('/upload-multiple', requireAuth, upload.array('images', 10), (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'لم يتم اختيار أي ملفات' 
            });
        }

        const uploadedImages = req.files.map(file => ({
            imageUrl: `${req.protocol}://${req.get('host')}/uploads/${file.filename}`,
            filename: file.filename,
            originalName: file.originalname,
            size: file.size
        }));

        res.json({
            success: true,
            message: `تم رفع ${req.files.length} صورة بنجاح!`,
            images: uploadedImages
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء رفع الصور',
            error: error.message
        });
    }
});

// الحصول على قائمة الصور المرفوعة (محمي)
app.get('/images', requireAuth, (req, res) => {
    try {
        const files = fs.readdirSync(uploadDir);
        const images = files
            .filter(file => {
                const ext = path.extname(file).toLowerCase();
                return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
            })
            .map(file => ({
                filename: file,
                url: `${req.protocol}://${req.get('host')}/uploads/${file}`,
                uploadDate: fs.statSync(path.join(uploadDir, file)).birthtime
            }))
            .sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));

        res.json({
            success: true,
            images: images
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء جلب الصور',
            error: error.message
        });
    }
});

// معالجة الأخطاء
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'حجم الملف كبير جداً. الحد الأقصى 5 ميجابايت'
            });
        }
    }
    
    res.status(500).json({
        success: false,
        message: error.message || 'حدث خطأ في الخادم'
    });
});

app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
    console.log(`📁 مجلد الصور: ${uploadDir}`);
});

module.exports = app;
