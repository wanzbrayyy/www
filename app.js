const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const multer = require('multer');
const methodOverride = require('method-override');
const session = require('express-session');
const flash = require('connect-flash');
const connectDB = require('./config/database');

const Article = require('./models/article');
const Comment = require('./models/comment');
const User = require('./models/user');
const Hero = require('./models/hero');
const Service = require('./models/service');
const Message = require('./models/message');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

connectDB();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(session({
    secret: 'plasmadinah_secret_key_2025',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));
app.use(flash());

app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');
    res.locals.user = req.session.user || null;
    next();
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-'))
});
const upload = multer({ storage: storage });

const protect = (req, res, next) => {
    if (req.session.user) return next();
    req.flash('error_msg', 'Please login to access admin panel');
    res.redirect('/auth/login');
};

const runSeeder = async () => {
    try {
        const adminExist = await User.findOne({ username: 'admin' });
        if (!adminExist) {
            await User.create({ username: 'admin', password: '123' });
        }
        const heroCount = await Hero.countDocuments();
        if (heroCount === 0) {
            await Hero.insertMany([
                { title: "INDONESIAN\nWHOLESALE", subtitle: "ESSENTIAL OILS MANUFACTURER", image: "hero1.jpg", order: 1 },
                { title: "PRIVATE\nLABELLING", subtitle: "OEM & ODM", image: "hero2.jpg", order: 2 },
                { title: "BUSINESS\nWITH", subtitle: "IMPACT", image: "hero3.jpg", order: 3 }
            ]);
        }
        const serviceCount = await Service.countDocuments();
        if (serviceCount === 0) {
            await Service.insertMany([
                { title: "Aroma Ingredients", description: "To create or amplify specific aromas, enhance taste and bring function.", image: "srv1.jpg" },
                { title: "Food, Beverages, Taste", description: "Snack seasoning, powdered, liquid beverages, dessert premixes.", image: "srv2.jpg" },
                { title: "Cosmetics & Perfumes", description: "For fragrance, body mist, extrait de parfum, eu de parfum, cologne.", image: "srv3.jpg" },
                { title: "Health and Nutrition", description: "To reduce stress and anxiety, to increase energy, provide relaxing effect.", image: "srv4.jpg" },
                { title: "Pharmaceutical Industries", description: "Used as anti-pain medication, infection and bacteria killer.", image: "srv5.jpg" },
                { title: "Tobacco and Vape", description: "For kretek, white, klobot and vape cigarettes.", image: "srv6.jpg" }
            ]);
        }
    } catch (err) {
        console.error("Seeder Error:", err);
    }
};
runSeeder();

io.on('connection', (socket) => {
    socket.on('join_article', (articleId) => {
        socket.join(articleId);
    });
    socket.on('new_comment', async (data) => {
        try {
            const newComment = await Comment.create({
                articleId: data.articleId,
                name: data.name,
                text: data.text
            });
            io.to(data.articleId).emit('update_comment', newComment);
        } catch (err) {
            console.error(err);
        }
    });
});

app.get('/', async (req, res) => {
    try {
        const heroes = await Hero.find().sort({ order: 1 });
        const services = await Service.find();
        
        const page = parseInt(req.query.page) || 1;
        const limit = 3;
        const skip = (page - 1) * limit;
        const totalArticles = await Article.countDocuments();
        const totalPages = Math.ceil(totalArticles / limit);
        const articles = await Article.find().sort({ createdAt: -1 }).skip(skip).limit(limit);

        res.render('index', { 
            heroes, 
            services, 
            articles,
            currentPage: page,
            totalPages
        });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

app.get('/blog/:id', async (req, res) => {
    try {
        const article = await Article.findById(req.params.id);
        if (!article) return res.redirect('/');
        
        const comments = await Comment.find({ articleId: req.params.id }).sort({ createdAt: -1 });
        const relatedArticles = await Article.find({ _id: { $ne: article._id } }).limit(3);

        article.views += 1;
        await article.save();
        io.to(req.params.id).emit('update_views', article.views);

        res.render('detail', { article, comments, relatedArticles });
    } catch (err) {
        res.redirect('/');
    }
});

app.post('/contact/send', async (req, res) => {
    try {
        await Message.create(req.body);
        req.flash('success_msg', 'Message sent successfully!');
    } catch (error) {
        req.flash('error_msg', 'Failed to send message.');
    }
    res.redirect(req.get('referer') || '/');
});

app.get('/auth/login', (req, res) => {
    if (req.session.user) return res.redirect('/admin');
    res.render('admin/login');
});

app.post('/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    
    if (user && (await user.matchPassword(password))) {
        req.session.user = { id: user._id, username: user.username };
        res.redirect('/admin');
    } else {
        req.flash('error_msg', 'Invalid Credentials');
        res.redirect('/auth/login');
    }
});

app.get('/auth/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

app.get('/admin', protect, async (req, res) => {
    const articles = await Article.find().sort({ createdAt: -1 });
    const heroes = await Hero.find().sort({ order: 1 });
    const services = await Service.find();
    const messages = await Message.find().sort({ createdAt: -1 });
    res.render('admin/dashboard', { articles, heroes, services, messages });
});

app.delete('/admin/message/delete/:id', protect, async (req, res) => {
    await Message.findByIdAndDelete(req.params.id);
    res.redirect('/admin');
});

app.get('/admin/article/create', protect, (req, res) => {
    res.render('admin/create', { type: 'article' });
});

app.post('/admin/article/store', protect, upload.single('image'), async (req, res) => {
    await Article.create({
        title: req.body.title,
        content: req.body.content,
        image: req.file ? req.file.filename : 'default.jpg'
    });
    res.redirect('/admin');
});

app.get('/admin/article/edit/:id', protect, async (req, res) => {
    const data = await Article.findById(req.params.id);
    res.render('admin/edit', { type: 'article', data });
});

app.put('/admin/article/update/:id', protect, upload.single('image'), async (req, res) => {
    let updateData = { title: req.body.title, content: req.body.content };
    if (req.file) updateData.image = req.file.filename;
    
    await Article.findByIdAndUpdate(req.params.id, updateData);
    res.redirect('/admin');
});

app.delete('/admin/article/delete/:id', protect, async (req, res) => {
    await Article.findByIdAndDelete(req.params.id);
    res.redirect('/admin');
});

app.get('/admin/hero/edit/:id', protect, async (req, res) => {
    const data = await Hero.findById(req.params.id);
    res.render('admin/edit_hero', { data });
});

app.put('/admin/hero/update/:id', protect, upload.single('image'), async (req, res) => {
    let updateData = { title: req.body.title, subtitle: req.body.subtitle };
    if (req.file) updateData.image = req.file.filename;
    await Hero.findByIdAndUpdate(req.params.id, updateData);
    res.redirect('/admin');
});

app.get('/admin/service/edit/:id', protect, async (req, res) => {
    const data = await Service.findById(req.params.id);
    res.render('admin/edit_service', { data });
});

app.put('/admin/service/update/:id', protect, upload.single('image'), async (req, res) => {
    let updateData = { title: req.body.title, description: req.body.description };
    if (req.file) updateData.image = req.file.filename;
    await Service.findByIdAndUpdate(req.params.id, updateData);
    res.redirect('/admin');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});