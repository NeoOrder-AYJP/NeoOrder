// js/app.js - Landing Page Logic for NeoOrder
import { supabaseClient } from './supabase.js';

// Fallback mock dishes if database is empty initially
const MOCK_DISHES = [
  {
    id: 'mock-1',
    nome: 'Risoto de Cogumelos Selvagens',
    descricao: 'Arroz arbóreo cremoso com mix de cogumelos frescos, azeite trufado e parmesão artesanal.',
    preco: 58.00,
    imagem: 'https://images.unsplash.com/photo-1633964913295-ceb43826e7c9?auto=format&fit=crop&w=800&q=80',
    destaque: true,
    ativo: true,
    disponivel: true
  },
  {
    id: 'mock-2',
    nome: 'Filé Mignon ao Molho Roti',
    descricao: 'Tornedor de filé mignon grelhado com batatas rústicas e aspargos salteados na manteiga.',
    preco: 82.00,
    imagem: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80',
    destaque: true,
    ativo: true,
    disponivel: true
  },
  {
    id: 'mock-3',
    nome: 'Salmão Grelhado com Ervas',
    descricao: 'Posta de salmão fresco grelhado acompanhado de purê de mandioquinha e legumes grelhados.',
    preco: 74.50,
    imagem: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=800&q=80',
    destaque: true,
    ativo: true,
    disponivel: true
  },
  {
    id: 'mock-4',
    nome: 'Pasta Carbonara Tradicional',
    descricao: 'Spaghetti com guanciale artesanal, gemas de ovos caipiras, pecorino romano e pimenta preta.',
    preco: 49.00,
    imagem: 'https://images.unsplash.com/photo-1612874742237-6526221588e3?auto=format&fit=crop&w=800&q=80',
    destaque: false,
    ativo: true,
    disponivel: true
  },
  {
    id: 'mock-5',
    nome: 'Burger Artesanal NeoOrder',
    descricao: 'Blend de 180g de Angus, queijo cheddar inglês, bacon crocante e maionese da casa no pão brioche.',
    preco: 42.00,
    imagem: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80',
    destaque: false,
    ativo: true,
    disponivel: false
  }
];

let carouselIndex = 0;
let carouselTimer = null;
let featuredDishes = [];
let allDishes = [];

document.addEventListener('DOMContentLoaded', async () => {
  await loadMenuData();
  setupCarouselControls();
});

async function loadMenuData() {
  try {
    let dishes = [];

    if (supabaseClient) {
      const { data, error } = await supabaseClient
        .from('pratos')
        .select('*')
        .eq('ativo', true);

      if (!error && data && data.length > 0) {
        dishes = data.map(dish => ({
          ...dish,
          disponivel: dish.disponivel !== undefined ? dish.disponivel : true
        }));
      }
    }

    if (dishes.length === 0) {
      console.log('Utilizando dados de demonstração...');
      dishes = MOCK_DISHES;
    }

    allDishes = dishes;
    featuredDishes = dishes.filter(d => d.destaque) || dishes.slice(0, 3);

    if (featuredDishes.length === 0) {
      featuredDishes = dishes.slice(0, 3);
    }

    renderCarousel(featuredDishes);
    renderMenuGrid(allDishes);
  } catch (err) {
    console.error('Erro ao carregar cardápio:', err);
    renderCarousel(MOCK_DISHES.filter(d => d.destaque));
    renderMenuGrid(MOCK_DISHES);
  }
}

function renderCarousel(dishes) {
  const container = document.getElementById('carousel-slides');
  const indicatorsContainer = document.getElementById('carousel-indicators');

  if (!container || !indicatorsContainer) return;

  container.innerHTML = '';
  indicatorsContainer.innerHTML = '';

  dishes.forEach((dish, idx) => {
    const slide = document.createElement('div');
    slide.className = `carousel-slide ${idx === 0 ? 'active' : ''}`;
    slide.dataset.index = idx;

    const formattedPrice = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(dish.preco);

    slide.innerHTML = `
      <div class="slide-content">
        <span class="badge badge-pending">Especial em Destaque</span>
        <h1>${escapeHtml(dish.nome)}</h1>
        <p>${escapeHtml(dish.descricao || '')}</p>
        <div class="slide-price">${formattedPrice}</div>
        <a href="#cardapio" class="btn btn-primary">
          <i class="fas fa-utensils"></i> Ver no Cardápio
        </a>
      </div>
      <div class="slide-image-wrapper">
        <img src="${escapeHtml(dish.imagem || 'https://via.placeholder.com/600x400?text=Sem+Imagem')}" alt="${escapeHtml(dish.nome)}">
      </div>
    `;

    container.appendChild(slide);

    const indicator = document.createElement('div');
    indicator.className = `indicator ${idx === 0 ? 'active' : ''}`;
    indicator.dataset.index = idx;
    indicator.addEventListener('click', () => goToSlide(idx));
    indicatorsContainer.appendChild(indicator);
  });

  startCarouselAutoRotate();
}

function renderMenuGrid(dishes) {
  const grid = document.getElementById('menu-grid');
  if (!grid) return;

  grid.innerHTML = '';

  dishes.forEach(dish => {
    const card = document.createElement('div');
    const isAvailable = dish.disponivel !== false;
    card.className = `card-dish ${isAvailable ? '' : 'unavailable'}`;

    const formattedPrice = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(dish.preco);

    const badgeHtml = isAvailable
      ? '<span class="badge badge-available"><i class="fas fa-check-circle"></i> Disponível</span>'
      : '<span class="badge badge-unavailable"><i class="fas fa-times-circle"></i> Indisponível</span>';

    card.innerHTML = `
      <img src="${escapeHtml(dish.imagem || 'https://via.placeholder.com/300x200?text=Sem+Imagem')}" class="card-dish-img" alt="${escapeHtml(dish.nome)}">
      <div class="card-dish-header">
        <h3 class="card-dish-title">${escapeHtml(dish.nome)}</h3>
      </div>
      <div style="margin-bottom: var(--space-xs);">${badgeHtml}</div>
      <p class="card-dish-desc">${escapeHtml(dish.descricao || '')}</p>
      <div class="card-dish-footer">
        <span class="card-dish-price">${formattedPrice}</span>
        <a href="#login-mesa" class="btn btn-secondary btn-sm" style="padding: 8px 16px; font-size: 13px;">
          Peça na Mesa
        </a>
      </div>
    `;

    grid.appendChild(card);
  });
}

function setupCarouselControls() {
  const prevBtn = document.getElementById('carousel-prev');
  const nextBtn = document.getElementById('carousel-next');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      prevSlide();
      resetCarouselTimer();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      nextSlide();
      resetCarouselTimer();
    });
  }
}

function goToSlide(index) {
  const slides = document.querySelectorAll('.carousel-slide');
  const indicators = document.querySelectorAll('.indicator');

  if (slides.length === 0) return;

  slides.forEach(s => s.classList.remove('active'));
  indicators.forEach(i => i.classList.remove('active'));

  carouselIndex = (index + slides.length) % slides.length;

  slides[carouselIndex].classList.add('active');
  if (indicators[carouselIndex]) {
    indicators[carouselIndex].classList.add('active');
  }
}

function nextSlide() {
  const slides = document.querySelectorAll('.carousel-slide');
  if (slides.length > 0) {
    goToSlide(carouselIndex + 1);
  }
}

function prevSlide() {
  const slides = document.querySelectorAll('.carousel-slide');
  if (slides.length > 0) {
    goToSlide(carouselIndex - 1);
  }
}

function startCarouselAutoRotate() {
  clearInterval(carouselTimer);
  carouselTimer = setInterval(() => {
    nextSlide();
  }, 5000); // RF-06 / RNF-06: 5 seconds rotation
}

function resetCarouselTimer() {
  startCarouselAutoRotate();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
