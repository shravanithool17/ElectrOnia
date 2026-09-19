import express from 'express';
import nodemailer from "nodemailer";
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import Customer from './model/user.model.js';
import Company from './model/company.model.js';
import Admin1 from './model/admin1.model.js';
import Product from './model/product.model.js';
import Order from './model/order.model.js';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// In-memory OTP store: { email: { otp, expiresAt, verified } }
const otpStore = {};

const mongooseURI = 'mongodb+srv://vyankateshc21:vmck@cluster0.plecrab.mongodb.net/yourdbname?retryWrites=true&w=majority';
mongoose.connect(mongooseURI)
    .then(async () => {
        console.log('✅ MongoDB connected successfully.');
        await seedProducts();
    })
    .catch(err => {
        console.error('❌ MongoDB connection error:', err.message);
        process.exit(1);
    });

// Initial product seeder if DB is empty
const seedProducts = async () => {
    try {
        const count = await Product.countDocuments();
        if (count === 0) {
            console.log('🌱 Seeding initial electronics products database...');
            const dummyProducts = [
                {
                    title: 'MacBook Pro 16" M3 Max',
                    description: 'Ultimate power for creative pros with 16-core CPU, 40-core GPU, and Liquid Retina XDR display.',
                    price: 2499,
                    originalPrice: 2799,
                    category: 'Laptops',
                    brand: 'Apple',
                    stock: 15,
                    rating: 4.9,
                    numReviews: 48,
                    images: ['https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=800&q=80'],
                    specifications: { Chip: 'Apple M3 Max', RAM: '36GB Unified', Storage: '1TB SSD', Display: '16.2-inch XDR' },
                    featured: true,
                },
                {
                    title: 'Dell XPS 15 OLED Touch',
                    description: 'Stunning 4K OLED display powered by Intel Core i9, 32GB RAM, and RTX 4070 Graphics.',
                    price: 1999,
                    originalPrice: 2299,
                    category: 'Laptops',
                    brand: 'Dell',
                    stock: 12,
                    rating: 4.7,
                    numReviews: 32,
                    images: ['https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=800&q=80'],
                    specifications: { Processor: 'Intel i9-13900H', GPU: 'NVIDIA RTX 4070', RAM: '32GB DDR5', Storage: '1TB NVMe' },
                    featured: true,
                },
                {
                    title: 'Sony WH-1000XM5 Wireless Headphones',
                    description: 'Industry-leading noise canceling with two processors and 8 microphones for superior sound quality.',
                    price: 349,
                    originalPrice: 399,
                    category: 'Audio',
                    brand: 'Sony',
                    stock: 30,
                    rating: 4.8,
                    numReviews: 120,
                    images: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80'],
                    specifications: { 'Battery Life': '30 Hours', 'Noise-Canceling': 'Active Dual Noise Sensor', Weight: '250g' },
                    featured: true,
                },
                {
                    title: 'Samsung Galaxy S24 Ultra 5G',
                    description: 'Galaxy AI is here. 200MP camera, Snapdragon 8 Gen 3, built-in S Pen, and titanium frame.',
                    price: 1199,
                    originalPrice: 1299,
                    category: 'Smartphones',
                    brand: 'Samsung',
                    stock: 20,
                    rating: 4.8,
                    numReviews: 89,
                    images: ['https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?auto=format&fit=crop&w=800&q=80'],
                    specifications: { Display: '6.8" Dynamic AMOLED 2X', Camera: '200MP + 50MP + 12MP', Battery: '5000 mAh' },
                    featured: true,
                },
                {
                    title: 'Apple Watch Ultra 2 GPS + Cellular',
                    description: 'Rugged titanium case, precision dual-frequency GPS, up to 36 hours battery life for adventurers.',
                    price: 799,
                    originalPrice: 849,
                    category: 'Wearables',
                    brand: 'Apple',
                    stock: 18,
                    rating: 4.9,
                    numReviews: 64,
                    images: ['https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=800&q=80'],
                    specifications: { Case: '49mm Titanium', 'Water Resistance': '100m', Brightness: '3000 nits' },
                    featured: true,
                },
                {
                    title: 'Sony PlayStation 5 Slim Digital',
                    description: 'Experience lightning-fast loading with an ultra-high speed SSD, deeper immersion with haptic feedback.',
                    price: 449,
                    originalPrice: 499,
                    category: 'Gaming',
                    brand: 'Sony',
                    stock: 8,
                    rating: 4.9,
                    numReviews: 210,
                    images: ['https://images.unsplash.com/photo-1606813907291-d86efa9b94db?auto=format&fit=crop&w=800&q=80'],
                    specifications: { Storage: '1TB Custom SSD', Resolution: 'Up to 4K 120Hz', HDR: 'Supported' },
                    featured: true,
                }
            ];
            await Product.insertMany(dummyProducts);
            console.log('✅ Default electronics products seeded successfully.');
        } else {
            // Update existing products to have featured: true if none exist
            const featuredCount = await Product.countDocuments({ featured: true });
            if (featuredCount === 0) {
                await Product.updateMany({}, { $set: { featured: true } });
                console.log('✅ Marked existing products as featured.');
            }
        }
    } catch (err) {
        console.error('Error seeding products:', err);
    }
};

// Nodemailer config
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: "project13v@gmail.com",
        pass: "uuwj jcmx brqq shjd"
    }
});

const sendOtpEmail = async (email, otp) => {
    const mailOptions = {
        from: "project13v@gmail.com",
        to: email,
        subject: "Your OTP for Signup Verification",
        text: `Your OTP is: ${otp}`
    };

    await transporter.sendMail(mailOptions);
};

// 👉 Route to send OTP
app.post('/send-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email] = {
        otp,
        expiresAt: Date.now() + 5 * 60 * 1000,
        verified: false
    };

    try {
        await sendOtpEmail(email, otp);
        res.status(200).json({ message: "OTP sent to email" });
    } catch (err) {
        console.error("Failed to send OTP:", err);
        res.status(500).json({ message: "Failed to send OTP" });
    }
});

// 👉 Route to verify OTP
app.post('/verify-otp', (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) {
        return res.status(400).json({ message: "Email and OTP are required" });
    }
  
    const record = otpStore[email];
    if (!record) {
        return res.status(400).json({ message: "OTP not found or not requested for this email" });
    }
    if (record.verified) {
        return res.status(400).json({ message: "OTP already verified" });
    }
    if (Date.now() > record.expiresAt) {
        delete otpStore[email];
        return res.status(400).json({ message: "OTP expired. Please request a new one." });
    }
    if (record.otp !== otp) {
        return res.status(400).json({ message: "Invalid OTP" });
    }
  
    otpStore[email].verified = true;
    res.status(200).json({ message: "OTP verified successfully" });
});

// 👉 Customer Signup
app.post('/signupcustomer', async (req, res) => {
    const { name, email, password, address, phone } = req.body;
    if (!name || !email || !password || !address || !phone) {
        return res.status(400).json({ message: "All fields are required" });
    }

    const otpData = otpStore[email];
    if (!otpData || !otpData.verified) {
        return res.status(403).json({ message: "OTP not verified" });
    }

    try {
        const existingUser = await Customer.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "Customer already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const customer = new Customer({
            name,
            email,
            password: hashedPassword,
            address,
            phone,
        });

        const savedCustomer = await customer.save();
        const token = jwt.sign(
            { id: savedCustomer._id, email: savedCustomer.email, name: savedCustomer.name },
            process.env.JWT_SECRET || 'defaultsecret',
            { expiresIn: '7d' }
        );

        delete otpStore[email];
        res.status(201).json({ message: "Customer created successfully", token });
    } catch (error) {
        console.error('Error during signup:', error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// 👉 Customer Login
app.post('/logincustomer', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
    }   
    try {
        const user = await Customer.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }   
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials" });
        }
        const token = jwt.sign(
            { id: user._id, email: user.email, name: user.name },
            process.env.JWT_SECRET || 'defaultsecret',
            { expiresIn: '7d' }
        );
        res.status(200).json({ message: "Login successful", token, user: { name: user.name, email: user.email } });
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ message: "Internal server error" });
    }
}); 

// 👉 Customer Profile
app.get("/profile", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "No token provided" });
    }
    const token = authHeader.split(" ")[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "defaultsecret");
        const customer = await Customer.findById(decoded.id).select("-password");
        if (!customer) {
            return res.status(404).json({ message: "Customer not found" });
        }
        res.status(200).json({
            customer: {
                id: customer._id,
                name: customer.name,
                email: customer.email,
                phone: customer.phone || "",
                address: customer.address || ""
            }
        });
    } catch (err) {
        console.error("Profile access error:", err.message);
        res.status(401).json({ message: "Invalid token" });
    }
});

// 👉 Vendor Signup
app.post("/signupvendor", async (req, res) => {
    const { name, email, password, address, phone, domain } = req.body;
    if (!name || !email || !password || !address || !phone || !domain) {
        return res.status(400).json({ message: "All fields are required" });
    }

    const otpEntry = otpStore[email];
    if (!otpEntry || !otpEntry.verified) {
        return res.status(403).json({ message: "OTP not verified. Please verify before signup." });
    }

    try {
        const existingCompany = await Company.findOne({ email });
        if (existingCompany) {
            return res.status(409).json({ message: "Email already registered" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newCompany = new Company({
            name,
            email,
            password: hashedPassword,
            address,
            phone,
            domain,
        });

        await newCompany.save();

        const vendorToken = jwt.sign(
            {
                id: newCompany._id,
                name: newCompany.name,
                email: newCompany.email,
                address: newCompany.address,
                phone: newCompany.phone,
                domain: newCompany.domain,
            },
            process.env.JWT_SECRET || 'defaultsecret',
            { expiresIn: "7d" }
        );

        delete otpStore[email];
        return res.status(201).json({
            message: "Vendor signup successful",
            vendorToken,
        });
    } catch (error) {
        console.error("Vendor signup error:", error);
        return res.status(500).json({ message: "Server error" });
    }
});

// 👉 Vendor Login
app.post("/loginvendor", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
    }
    try {
        const company = await Company.findOne({ email });
        if (!company) {
            return res.status(404).json({ message: "Vendor not found" });
        } 
        const isMatch = await bcrypt.compare(password, company.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials" });
        }
        const vendorToken = jwt.sign(
            { id: company._id, email: company.email, name: company.name },
            process.env.JWT_SECRET || 'defaultsecret',
            { expiresIn: "7d" }
        );  
        res.status(200).json({ message: "Login successful", vendorToken, company: { name: company.name, email: company.email } });
    } catch (error) {
        console.error('Error during vendor login:', error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.post('/sendvendorotp', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email] = {
        otp,
        expiresAt: Date.now() + 5 * 60 * 1000,
        verified: false,
    };

    try {
        await sendOtpEmail(email, otp);
        res.status(200).json({ message: "OTP sent to email" });
    } catch (err) {
        console.error("Failed to send OTP:", err);
        res.status(500).json({ message: "Failed to send OTP" });
    }
});

// ==========================================
// 🛍️ PRODUCTS API ENDPOINTS
// ==========================================

// 👉 GET All Products (Public, with filter, search, sorting)
app.get('/api/products', async (req, res) => {
    try {
        const { search, category, minPrice, maxPrice, sort, featured } = req.query;
        let query = {};

        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { brand: { $regex: search, $options: 'i' } }
            ];
        }

        if (category && category !== 'All') {
            query.category = category;
        }

        if (featured === 'true') {
            query.featured = true;
        }

        if (minPrice || maxPrice) {
            query.price = {};
            if (minPrice) query.price.$gte = Number(minPrice);
            if (maxPrice) query.price.$lte = Number(maxPrice);
        }

        let sortOption = { createdAt: -1 };
        if (sort === 'price_asc') sortOption = { price: 1 };
        if (sort === 'price_desc') sortOption = { price: -1 };
        if (sort === 'rating') sortOption = { rating: -1 };

        const products = await Product.find(query).sort(sortOption);
        res.status(200).json(products);
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ message: 'Error fetching products' });
    }
});

// 👉 GET Single Product Detail (Public)
app.get('/api/products/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }
        res.status(200).json(product);
    } catch (error) {
        console.error('Error fetching single product:', error);
        res.status(500).json({ message: 'Error fetching product' });
    }
});

// 👉 POST Add New Product (Vendor Protected)
app.post('/api/products', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Vendor authentication required" });
    }
    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "defaultsecret");
        const { title, description, price, originalPrice, category, brand, stock, images, specifications, featured } = req.body;

        if (!title || !description || !price || !category || !brand) {
            return res.status(400).json({ message: "Title, description, price, category and brand are required" });
        }

        const newProduct = new Product({
            title,
            description,
            price: Number(price),
            originalPrice: originalPrice ? Number(originalPrice) : Number(price) * 1.2,
            category,
            brand,
            stock: stock ? Number(stock) : 10,
            images: images && images.length > 0 ? images : ['https://images.unsplash.com/photo-1526738549149-8e07eca6c147?auto=format&fit=crop&w=800&q=80'],
            specifications: specifications || {},
            companyId: decoded.id,
            featured: featured || false,
        });

        const savedProduct = await newProduct.save();
        res.status(201).json({ message: 'Product created successfully', product: savedProduct });
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(500).json({ message: 'Failed to create product' });
    }
});

// 👉 DELETE Product (Vendor Protected)
app.delete('/api/products/:id', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Vendor authentication required" });
    }
    const token = authHeader.split(" ")[1];

    try {
        jwt.verify(token, process.env.JWT_SECRET || "defaultsecret");
        const product = await Product.findByIdAndDelete(req.params.id);
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }
        res.status(200).json({ message: "Product deleted successfully" });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ message: "Failed to delete product" });
    }
});

// ==========================================
// 📦 ORDERS API ENDPOINTS
// ==========================================

// 👉 POST Create New Order (Customer Protected)
app.post('/api/orders', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Please login to place an order" });
    }
    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "defaultsecret");
        const { items, totalAmount, shippingAddress, paymentMethod } = req.body;

        if (!items || items.length === 0 || !totalAmount || !shippingAddress) {
            return res.status(400).json({ message: "Order details, items, and address are required" });
        }

        const customer = await Customer.findById(decoded.id);

        const newOrder = new Order({
            customerId: decoded.id,
            customerName: customer ? customer.name : (decoded.name || 'Customer'),
            customerEmail: customer ? customer.email : decoded.email,
            items,
            totalAmount,
            shippingAddress,
            paymentMethod: paymentMethod || 'COD',
            status: 'Processing',
        });

        const savedOrder = await newOrder.save();
        res.status(201).json({ message: 'Order placed successfully!', order: savedOrder });
    } catch (error) {
        console.error('Error placing order:', error);
        res.status(500).json({ message: 'Failed to place order' });
    }
});

// 👉 GET Customer Orders
app.get('/api/orders/my-orders', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Customer authentication required" });
    }
    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "defaultsecret");
        const orders = await Order.find({ customerId: decoded.id }).sort({ createdAt: -1 });
        res.status(200).json(orders);
    } catch (error) {
        console.error('Error fetching my orders:', error);
        res.status(500).json({ message: 'Error fetching orders' });
    }
});

// 👉 GET Vendor Orders
app.get('/api/orders/vendor-orders', async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.status(200).json(orders);
    } catch (error) {
        console.error('Error fetching vendor orders:', error);
        res.status(500).json({ message: 'Error fetching vendor orders' });
    }
});

// 👉 PATCH Update Order Status (Vendor/Admin)
app.patch('/api/orders/:id/status', async (req, res) => {
    const { status } = req.body;
    try {
        const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!order) return res.status(404).json({ message: 'Order not found' });
        res.status(200).json({ message: 'Status updated', order });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update order status' });
    }
});

app.listen(3000, () => {
    console.log(`🚀 Server running at http://localhost:3000`);
});
