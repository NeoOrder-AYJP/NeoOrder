// js/app.js — Landing page (cardápio público)
//
// Consome exclusivamente a RPC pública `pratos_cardapio()`. Não há fallback
// para dados fictícios: se o banco responder vazio, a página informa isso.

(function () {
  const PLACEHOLDER = 'assets/pratos/sem-imagem.svg';

  let carouselIndex = 0;
  let carouselTimer = null;
  let dishes = [];

  document.addEventListener('DOMContentLoaded', () => {
    setupCarouselControls();
    setupCallStaff();
    loadMenu();
  });

  // ---------------------------------------------------------------------------
  // RF-26: "Chamar Funcionário" também na landing page, quando há sessão de mesa
  // ---------------------------------------------------------------------------

  function setupCallStaff() {
    const session = window.NeoAPI && window.NeoAPI.Session ? window.NeoAPI.Session.get() : null;
    if (!session || !session.usuario || session.usuario.tipo !== 'mesa') return;

    const fab = document.getElementById('btnCallStaffGlobal');
    const modal = document.getElementById('callStaffGlobalModal');
    const form = document.getElementById('callStaffGlobalForm');
    const select = document.getElementById('callGlobalReason');
    const otherGroup = document.getElementById('callGlobalOtherGroup');
    const otherInput = document.getElementById('callGlobalJustification');

    if (!fab || !modal || !form) return;

    fab.style.display = 'inline-flex';

    // Mesa já autenticada vai direto para o cardápio, sem passar pelo login.
    const pedir = document.getElementById('btn-fazer-pedido');
    if (pedir) {
      pedir.setAttribute('href', 'cardapio.html');
      pedir.innerHTML = '<i class="fas fa-book-open"></i> Ir para o Cardápio';
    }

    const abrir = () => { modal.style.display = 'flex'; };
    const fechar = () => { modal.style.display = 'none'; };

    fab.addEventListener('click', abrir);
    ['btnCloseCallStaffGlobal', 'btnCancelCallStaffGlobal'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', fechar);
    });

    if (select) {
      select.addEventListener('change', () => {
        if (otherGroup) otherGroup.style.display = select.value === 'Outro' ? 'block' : 'none';
      });
    }

    modal.addEventListener('click', e => { if (e.target === modal) fechar(); });

    form.addEventListener('submit', async e => {
      e.preventDefault();

      let motivo = select ? select.value : '';
      if (motivo === 'Outro') {
        motivo = otherInput && otherInput.value.trim() ? otherInput.value.trim() : 'Outro motivo';
      }
      if (!motivo) return;

      const button = document.getElementById('btnSubmitCallStaffGlobal');
      NeoUI.setBusy(button, true, 'Enviando...');

      try {
        await NeoAPI.criarChamado(session.token, motivo);
        fechar();
        form.reset();
        if (otherGroup) otherGroup.style.display = 'none';
        NeoUI.toast('Chamado enviado. Um atendente já foi avisado.', 'success', 5000);
      } catch (err) {
        NeoUI.toast(err.message || 'Não foi possível enviar o chamado.', 'error', 7000);
      } finally {
        NeoUI.setBusy(button, false);
      }
    });
  }

  async function loadMenu() {
    const grid = document.getElementById('menu-grid');
    const slides = document.getElementById('carousel-slides');

    if (grid) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><span class="spinner"></span><span>Carregando cardápio...</span></div>';
    }

    try {
      const data = await NeoAPI.pratosCardapio();
      dishes = Array.isArray(data) ? data : [];
    } catch (err) {
      console.error('Falha ao carregar cardápio:', err);
      dishes = [];
      if (grid) {
        NeoUI.empty(grid, 'cloud_off', 'Não foi possível carregar o cardápio',
          err.message || 'Verifique a conexão e tente novamente.');
      }
    }

    if (!dishes.length) {
      if (grid) NeoUI.empty(grid, 'restaurant_menu', 'Cardápio em montagem', 'Em breve nossos pratos estarão disponíveis.');
      if (slides) slides.innerHTML = '';
      return;
    }

    const featured = dishes.filter(d => d.destaque);
    renderCarousel(featured.length ? featured : dishes.slice(0, 3));
    renderMenuGrid(dishes);
  }

  function imageUrl(dish) {
    const src = dish && dish.imagem ? String(dish.imagem).trim() : '';
    return src || PLACEHOLDER;
  }

  function renderCarousel(items) {
    const container = document.getElementById('carousel-slides');
    const indicators = document.getElementById('carousel-indicators');
    if (!container || !indicators) return;

    container.innerHTML = '';
    indicators.innerHTML = '';
    carouselIndex = 0;

    items.forEach((dish, idx) => {
      const slide = document.createElement('div');
      slide.className = `carousel-slide ${idx === 0 ? 'active' : ''}`;
      slide.innerHTML = `
        <div class="slide-content">
          <span class="badge badge-pending">Especial em Destaque</span>
          <h1>${escapeHtml(dish.nome)}</h1>
          <p>${escapeHtml(dish.descricao || '')}</p>
          <div class="slide-price">${NeoUI.money(dish.preco)}</div>
          <a href="#cardapio" class="btn btn-primary">
            <i class="fas fa-utensils"></i> Ver no Cardápio
          </a>
        </div>
        <div class="slide-image-wrapper">
          <img src="${escapeHtml(imageUrl(dish))}" alt="${escapeHtml(dish.nome)}"
               onerror="this.onerror=null;this.src='${PLACEHOLDER}'">
        </div>`;
      container.appendChild(slide);

      const indicator = document.createElement('div');
      indicator.className = `indicator ${idx === 0 ? 'active' : ''}`;
      indicator.addEventListener('click', () => goToSlide(idx));
      indicators.appendChild(indicator);
    });

    startCarouselAutoRotate();
  }

  function renderMenuGrid(items) {
    const grid = document.getElementById('menu-grid');
    if (!grid) return;

    grid.innerHTML = '';

    items.forEach(dish => {
      const available = dish.disponivel !== false;
      const card = document.createElement('div');
      card.className = `card-dish ${available ? '' : 'unavailable'}`;

      const badge = available
        ? '<span class="badge badge-available"><i class="fas fa-check-circle"></i> Disponível</span>'
        : '<span class="badge badge-unavailable"><i class="fas fa-times-circle"></i> Indisponível</span>';

      card.innerHTML = `
        <img src="${escapeHtml(imageUrl(dish))}" class="card-dish-img" alt="${escapeHtml(dish.nome)}"
             loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER}'">
        <div class="card-dish-header">
          <h3 class="card-dish-title">${escapeHtml(dish.nome)}</h3>
        </div>
        <div style="margin-bottom: var(--space-xs);">${badge}</div>
        <p class="card-dish-desc">${escapeHtml(dish.descricao || '')}</p>
        <div class="card-dish-footer">
          <span class="card-dish-price">${NeoUI.money(dish.preco)}</span>
          ${available
            ? '<a href="login.html?type=mesa" class="btn btn-secondary btn-sm" style="padding: 8px 16px; font-size: 13px;">Peça na Mesa</a>'
            : '<span class="badge badge-unavailable" style="font-size:12px;">Esgotado</span>'}
        </div>`;
      grid.appendChild(card);
    });
  }

  function setupCarouselControls() {
    const prevBtn = document.getElementById('carousel-prev');
    const nextBtn = document.getElementById('carousel-next');
    if (prevBtn) prevBtn.addEventListener('click', () => { goToSlide(carouselIndex - 1); resetCarouselTimer(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { goToSlide(carouselIndex + 1); resetCarouselTimer(); });

    document.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') { goToSlide(carouselIndex - 1); resetCarouselTimer(); }
      if (e.key === 'ArrowRight') { goToSlide(carouselIndex + 1); resetCarouselTimer(); }
    });
  }

  function goToSlide(index) {
    const slides = document.querySelectorAll('.carousel-slide');
    const indicators = document.querySelectorAll('.indicator');
    if (!slides.length) return;

    slides.forEach(s => s.classList.remove('active'));
    indicators.forEach(i => i.classList.remove('active'));

    carouselIndex = (index + slides.length) % slides.length;
    slides[carouselIndex].classList.add('active');
    if (indicators[carouselIndex]) indicators[carouselIndex].classList.add('active');
  }

  function startCarouselAutoRotate() {
    clearInterval(carouselTimer);
    carouselTimer = setInterval(() => goToSlide(carouselIndex + 1), 6000);
  }

  function resetCarouselTimer() {
    startCarouselAutoRotate();
  }
})();
