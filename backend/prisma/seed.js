// ========================================
// Database Seed
// Creates initial test data
// ========================================

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Starting database seed...');

    // Create test users
    const password = await bcrypt.hash('password123', 12);

    const user1 = await prisma.user.upsert({
        where: { email: 'carlos@deskshare.com' },
        update: {},
        create: {
            email: 'carlos@deskshare.com',
            passwordHash: password,
            name: 'Carlos Méndez',
            avatarUrl: 'https://i.pravatar.cc/150?img=12',
            rating: 4.8,
            reviewsCount: 89
        }
    });

    const user2 = await prisma.user.upsert({
        where: { email: 'maria@deskshare.com' },
        update: {},
        create: {
            email: 'maria@deskshare.com',
            passwordHash: password,
            name: 'María García',
            rating: 4.9,
            reviewsCount: 56
        }
    });

    const user3 = await prisma.user.upsert({
        where: { email: 'juan@deskshare.com' },
        update: {},
        create: {
            email: 'juan@deskshare.com',
            passwordHash: password,
            name: 'Juan López',
            rating: 4.7,
            reviewsCount: 34
        }
    });

    console.log('✓ Users created');

    // Create sample computers
    const computer1 = await prisma.computer.create({
        data: {
            userId: user1.id,
            name: 'Workstation Profesional',
            description: 'Estación de trabajo de alto rendimiento perfecta para edición de video profesional, modelado 3D, y desarrollo de software.',
            category: 'workstation',
            pricePerHour: 8.00,
            cpu: 'Intel Core i9-13900K',
            gpu: 'NVIDIA GeForce RTX 4080 16GB',
            ram: 64,
            storage: '2TB NVMe SSD',
            os: 'Windows 11 Pro',
            internetSpeed: '1Gbps Fiber',
            accessMethod: 'rdp',
            rdpPort: 3389,
            status: 'active',
            images: {
                create: [
                    {
                        imageUrl: 'https://images.unsplash.com/photo-1587202372634-32705e3bf49c?w=800',
                        isPrimary: true
                    }
                ]
            }
        }
    });

    const computer2 = await prisma.computer.create({
        data: {
            userId: user1.id,
            name: 'Rendering Powerhouse',
            description: 'Máxima potencia para renders 3D y simulaciones. Equipada con los mejores componentes del mercado.',
            category: 'rendering',
            pricePerHour: 15.00,
            cpu: 'AMD Threadripper PRO 5975WX',
            gpu: 'NVIDIA RTX 4090',
            ram: 128,
            storage: '4TB NVMe SSD',
            os: 'Windows 11 Pro',
            internetSpeed: '1Gbps Fiber',
            accessMethod: 'rdp',
            status: 'active',
            images: {
                create: [
                    {
                        imageUrl: 'https://images.unsplash.com/photo-1593640408182-31c70c8268f5?w=800',
                        isPrimary: true
                    }
                ]
            }
        }
    });

    const computer3 = await prisma.computer.create({
        data: {
            userId: user2.id,
            name: 'Gaming Elite Setup',
            description: 'Gaming en ultra settings, streaming y grabación simultánea. Experiencia gaming premium.',
            category: 'gaming',
            pricePerHour: 6.00,
            cpu: 'AMD Ryzen 9 7950X',
            gpu: 'NVIDIA RTX 4070 Ti',
            ram: 32,
            storage: '1TB NVMe SSD',
            os: 'Windows 11 Home',
            internetSpeed: '500Mbps',
            accessMethod: 'chrome-remote',
            status: 'active',
            images: {
                create: [
                    {
                        imageUrl: 'https://images.unsplash.com/photo-1591238372338-a9b1f9e6b5cf?w=800',
                        isPrimary: true
                    }
                ]
            }
        }
    });

    const computer4 = await prisma.computer.create({
        data: {
            userId: user3.id,
            name: 'Development Station',
            description: 'Perfecto para desarrollo full-stack, compilación de proyectos grandes y testing.',
            category: 'development',
            pricePerHour: 5.00,
            cpu: 'Intel Core i7-13700K',
            gpu: 'NVIDIA RTX 4060 Ti',
            ram: 32,
            storage: '1TB NVMe SSD',
            os: 'Ubuntu 22.04 LTS',
            internetSpeed: '500Mbps',
            accessMethod: 'vnc',
            status: 'active'
        }
    });

    console.log('✓ Computers created');

    // Create a sample booking
    const booking = await prisma.booking.create({
        data: {
            computerId: computer1.id,
            renterId: user2.id,
            priceAgreed: 8.00,
            status: 'completed',
            startTime: new Date(Date.now() - 3600000 * 2), // 2 hours ago
            endTime: new Date(Date.now() - 60000 * 30), // 30 minutes ago
            actualDurationHours: 1.5,
            totalPrice: 12.00,
            paymentStatus: 'paid'
        }
    });

    // Create a review
    await prisma.review.create({
        data: {
            bookingId: booking.id,
            reviewerId: user2.id,
            revieweeId: user1.id,
            rating: 5,
            comment: 'Excelente equipo! Renderé un proyecto de 45 minutos en solo 3 horas. Carlos fue muy atento y me ayudó con la configuración inicial. 100% recomendado.'
        }
    });

    console.log('✓ Bookings and reviews created');

    // Create sample messages
    await prisma.message.createMany({
        data: [
            {
                senderId: user2.id,
                receiverId: user1.id,
                computerId: computer1.id,
                message: 'Hola! Necesito el equipo para render de video 4K. ¿Cuánto es para 5 horas?'
            },
            {
                senderId: user1.id,
                receiverId: user2.id,
                computerId: computer1.id,
                message: 'Perfecto! Para 5 horas te puedo hacer $35 en total. La máquina está optimizada para DaVinci Resolve.',
                isRead: true
            }
        ]
    });

    console.log('✓ Messages created');
    console.log('\n🎉 Database seed completed successfully!');
    console.log('\n📝 Test Credentials:');
    console.log('   Email: carlos@deskshare.com');
    console.log('   Password: password123');
    console.log('\n   Email: maria@deskshare.com');
    console.log('   Password: password123');
}

main()
    .catch((e) => {
        console.error('Error seeding database:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
