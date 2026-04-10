/**
 * =============================================
 * SCROLL ANIMATION CONTROLLER
 * Controla animación frame por frame mediante scroll
 * Optimizado para móviles
 * =============================================
 */

(function() {
    'use strict';

    // =============================================
    // CONFIGURACIÓN
    // =============================================
    
    const CONFIG = {
        // Ruta base de los frames
        framesPath: 'fotogramas/',
        // Prefijo del nombre de archivo
        framePrefix: '',
        // Extensión de archivo
        frameExtension: '.png',
        // Número total de frames
        totalFrames: 291,
        // Dígitos para padding (frame_001, frame_002, etc.)
        framePadding: 4,
        // Suavizado de transición (0 = sin suavizado, 1 = máximo)
        smoothing: 0.3,
        // Mostrar barra de progreso
        showProgressBar: false
    };

    // =============================================
    // ESTADO DE LA APLICACIÓN
    // =============================================
    
    const state = {
        images: [],           // Array de imágenes precargadas
        currentFrame: 0,      // Frame actual mostrado
        targetFrame: 0,       // Frame objetivo (para suavizado)
        lastRenderedFrame: -1, // Último frame renderizado
        isLoading: true,      // Estado de carga
        loadedCount: 0,       // Contador de imágenes cargadas
        rafId: null,          // ID de requestAnimationFrame
        canvasContext: null,  // Contexto del canvas
        canvasWidth: 0,       // Ancho del canvas
        canvasHeight: 0       // Alto del canvas
    };

    // =============================================
    // ELEMENTOS DEL DOM
    // =============================================
    
    const elements = {
        canvas: null,
        loadingOverlay: null,
        loadingText: null,
        progressBar: null,
        scrollContainer: null
    };

    // =============================================
    // UTILIDADES
    // =============================================
    
    /**
     * Genera el nombre del archivo de frame con padding
     * @param {number} index - Índice del frame (1-based)
     * @returns {string} - Nombre del archivo
     */
    function getFrameFileName(index) {
        const paddedIndex = String(index).padStart(CONFIG.framePadding, '0');
        return `${CONFIG.framesPath}${CONFIG.framePrefix}${paddedIndex}${CONFIG.frameExtension}`;
    }

    /**
     * Limita un valor entre un mínimo y máximo
     * @param {number} value - Valor a limitar
     * @param {number} min - Valor mínimo
     * @param {number} max - Valor máximo
     * @returns {number} - Valor limitado
     */
    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    /**
     * Interpola linealmente entre dos valores
     * @param {number} start - Valor inicial
     * @param {number} end - Valor final
     * @param {number} factor - Factor de interpolación (0-1)
     * @returns {number} - Valor interpolado
     */
    function lerp(start, end, factor) {
        return start + (end - start) * factor;
    }

    // =============================================
    // PRECARGA DE IMÁGENES
    // =============================================
    
    /**
     * Precarga todas las imágenes de frames
     * @returns {Promise} - Promesa que resuelve cuando todas las imágenes están cargadas
     */
    function preloadImages() {
        const promises = [];

        for (let i = 0; i < CONFIG.totalFrames; i++) {
            const promise = new Promise((resolve, reject) => {
                const img = new Image();
                
                img.onload = () => {
                    state.loadedCount++;
                    updateLoadingProgress();
                    resolve(img);
                };
                
                img.onerror = () => {
                    console.warn(`Error cargando frame ${i}: ${img.src}`);
                    // Resolver con null para no bloquear la carga
                    resolve(null);
                };
                
                img.src = getFrameFileName(i);
            });
            
            promises.push(promise);
        }

        return Promise.all(promises).then(images => {
            // Filtrar imágenes nulas y almacenar
            state.images = images.filter(img => img !== null);
            
            if (state.images.length === 0) {
                throw new Error('No se pudieron cargar las imágenes');
            }
            
            return state.images;
        });
    }

    /**
     * Actualiza el indicador de progreso de carga
     */
    function updateLoadingProgress() {
        const progress = Math.round((state.loadedCount / CONFIG.totalFrames) * 100);
        if (elements.loadingText) {
            elements.loadingText.textContent = `Cargando frames... ${progress}%`;
        }
    }

    // =============================================
    // CONFIGURACIÓN DEL CANVAS
    // =============================================
    
    /**
     * Configura el canvas con las dimensiones correctas
     */
    function getViewportDimensions() {
        // Usar window.innerWidth/Height - funciona en iOS Safari
        return {
            width: window.innerWidth,
            height: window.innerHeight
        };
    }

    function setupCanvas() {
        if (!state.images.length) return;

        // Usar window.innerWidth/Height directamente - más confiable en iOS
        const width = window.innerWidth;
        const height = window.innerHeight;

        // Para iOS: NO usar devicePixelRatio alto, causa problemas de escala
        // Usar 1 para máxima compatibilidad
        const pixelRatio = 1;

        // Establecer dimensiones del buffer del canvas igual a viewport
        elements.canvas.width = width;
        elements.canvas.height = height;
        
        // Establecer dimensiones CSS explícitas
        elements.canvas.style.width = width + 'px';
        elements.canvas.style.height = height + 'px';
        elements.canvas.style.position = 'absolute';
        elements.canvas.style.top = '0';
        elements.canvas.style.left = '0';

        state.canvasWidth = width;
        state.canvasHeight = height;

        // Resetear transformaciones del contexto
        state.canvasContext.setTransform(1, 0, 0, 1, 0, 0);
        
        // Forzar re-renderizado
        state.lastRenderedFrame = -1;
        
        console.log('[v0] Canvas setup:', width, 'x', height);
    }

    // =============================================
    // RENDERIZADO
    // =============================================
    
    /**
     * Renderiza un frame específico en el canvas
     * @param {number} frameIndex - Índice del frame a renderizar
     */
    function renderFrame(frameIndex) {
        if (!state.canvasContext || !state.images.length) return;
        
        const index = clamp(frameIndex, 0, state.images.length - 1);
        const image = state.images[index];
        
        if (!image) return;
        
        // Usar dimensiones del canvas directamente
        const canvasWidth = state.canvasWidth;
        const canvasHeight = state.canvasHeight;
        
        // Limpiar canvas
        state.canvasContext.clearRect(0, 0, canvasWidth, canvasHeight);
        
        // Dimensiones de la imagen
        const imgWidth = image.naturalWidth;
        const imgHeight = image.naturalHeight;
        
        // Calcular escala para cubrir el canvas (cover)
        const scaleX = canvasWidth / imgWidth;
        const scaleY = canvasHeight / imgHeight;
        const scale = Math.max(scaleX, scaleY);
        
        // Dimensiones escaladas
        const scaledWidth = imgWidth * scale;
        const scaledHeight = imgHeight * scale;
        
        // Posición para centrar
        const x = (canvasWidth - scaledWidth) / 2;
        const y = (canvasHeight - scaledHeight) / 2;
        
        // Dibujar imagen escalada y centrada
        state.canvasContext.drawImage(
            image, 
            x, y, 
            scaledWidth, 
            scaledHeight
        );
    }

    // =============================================
    // CONTROL DE SCROLL
    // =============================================
    
    /**
     * Calcula el frame correspondiente según la posición del scroll
     * @returns {number} - Índice del frame
     */
    function calculateFrameFromScroll() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;

        // Evitar división por cero
        if (maxScroll <= 0) return 0;

        // Calcular progreso del scroll (0 a 1)
        const scrollProgress = clamp(scrollTop / maxScroll, 0, 1);

        // Mapear progreso a índice de frame
        const frameIndex = scrollProgress * (state.images.length - 1);

        // Actualizar barra de progreso
        if (CONFIG.showProgressBar && elements.progressBar) {
            elements.progressBar.style.width = `${scrollProgress * 100}%`;
        }

        return frameIndex;
    }

    /**
     * Maneja el evento de scroll
     */
    function handleScroll() {
        state.targetFrame = calculateFrameFromScroll();
    }

    // =============================================
    // LOOP DE ANIMACIÓN
    // =============================================
    
    /**
     * Loop principal de animación usando requestAnimationFrame
     */
    function animationLoop() {
        if (!state.isLoading) {
            if (CONFIG.smoothing > 0) {
                state.currentFrame = lerp(
                    state.currentFrame,
                    state.targetFrame,
                    CONFIG.smoothing
                );
                
                if (Math.abs(state.targetFrame - state.currentFrame) < 0.01) {
                    state.currentFrame = state.targetFrame;
                }
            } else {
                state.currentFrame = state.targetFrame;
            }

            const roundedFrame = Math.round(state.currentFrame);
            if (roundedFrame !== state.lastRenderedFrame) {
                renderFrame(roundedFrame);
                state.lastRenderedFrame = roundedFrame;
            }
        }

        // Continuar el loop
        state.rafId = requestAnimationFrame(animationLoop);
    }

    // =============================================
    // MANEJO DE RESIZE
    // =============================================
    
    /**
     * Debounce para optimizar eventos frecuentes
     * @param {Function} func - Función a ejecutar
     * @param {number} wait - Tiempo de espera en ms
     * @returns {Function} - Función con debounce
     */
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    /**
     * Maneja el cambio de tamaño de ventana
     */
    const handleResize = debounce(() => {
        setupCanvas();
        renderFrame(Math.round(state.currentFrame));
    }, 150);

    // =============================================
    // INICIALIZACIÓN
    // =============================================
    
    /**
     * Oculta el overlay de carga
     */
    function hideLoadingOverlay() {
        if (elements.loadingOverlay) {
            elements.loadingOverlay.classList.add('hidden');
            // Remover del DOM después de la transición
            setTimeout(() => {
                elements.loadingOverlay.style.display = 'none';
            }, 300);
        }
    }

    /**
     * Muestra mensaje de error
     * @param {string} message - Mensaje de error
     */
    function showError(message) {
        if (elements.loadingText) {
            elements.loadingText.textContent = message;
            elements.loadingText.style.color = '#ef4444';
        }
    }

    /**
     * Inicializa la aplicación
     */
    async function init() {
        // Obtener referencias a elementos del DOM
        elements.canvas = document.getElementById('animation-canvas');
        elements.loadingOverlay = document.getElementById('loading-overlay');
        elements.loadingText = document.getElementById('loading-text');
        elements.progressBar = document.getElementById('progress-bar');
        elements.scrollContainer = document.getElementById('scroll-container');
        
        // Verificar elementos críticos
        if (!elements.canvas) {
            console.error('Canvas no encontrado');
            return;
        }
        
        // Obtener contexto del canvas
        state.canvasContext = elements.canvas.getContext('2d');
        
        if (!state.canvasContext) {
            showError('Error: Canvas no soportado');
            return;
        }

        try {
            // Precargar imágenes
            await preloadImages();
            
            // Configurar canvas
            setupCanvas();
            
            // Renderizar primer frame
            renderFrame(0);
            
            // Ocultar overlay de carga
            state.isLoading = false;
            hideLoadingOverlay();
            
            // Configurar event listeners
            window.addEventListener('scroll', handleScroll, { passive: true });
            window.addEventListener('resize', handleResize, { passive: true });
            
            // Para iOS Safari: escuchar cambios de orientación
            window.addEventListener('orientationchange', () => {
                // Esperar a que iOS actualice las dimensiones
                setTimeout(() => {
                    setupCanvas();
                    renderFrame(Math.round(state.currentFrame));
                }, 100);
            });
            
            if (window.visualViewport) {
                window.visualViewport.addEventListener('resize', handleResize);
                window.visualViewport.addEventListener('scroll', handleResize);
            }
            
            // Iniciar loop de animación
            animationLoop();
            
            // Calcular frame inicial (por si la página se carga con scroll)
            handleScroll();
            
        } catch (error) {
            console.error('Error inicializando animación:', error);
            showError('Error cargando la animación');
        }
    }

    // =============================================
    // LIMPIEZA
    // =============================================
    
    /**
     * Limpia recursos al salir de la página
     */
    function cleanup() {
        if (state.rafId) {
            cancelAnimationFrame(state.rafId);
        }
        window.removeEventListener('scroll', handleScroll);
        window.removeEventListener('resize', handleResize);
    }

    // Event listener para limpieza
    window.addEventListener('beforeunload', cleanup);

    // Iniciar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
