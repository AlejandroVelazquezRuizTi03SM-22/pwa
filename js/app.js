// ============================================================================
// 1. CONFIGURACIÓN GLOBAL Y REFERENCIAS DOM
// ============================================================================

// Referencias a elementos principales del HTML
const mainContent = document.getElementById('content');
const appNav = document.getElementById('app-nav');
const connectionToast = document.getElementById('connection-toast');

// Estado de la sesión y usuario actual
let currentUserRole = null; 
let currentStudentId = localStorage.getItem('student_id') || '';

// Claves para almacenamiento local (LocalStorage)
// Se usan para persistencia de datos cuando no hay internet
const INVENTORY_KEY = 'unistock_inventory';
const CART_KEY = 'unistock_loan_cart';


// ============================================================================
// 2. GESTIÓN DE CONECTIVIDAD (ONLINE/OFFLINE)
// ============================================================================

/**
 * Monitor de Estado de Red.
 * Muestra una barra visual cuando la conexión cambia.
 */
function updateConnectionStatus() {
    if (!connectionToast) return; // Protección si el elemento no existe

    if (navigator.onLine) {
        // Lógica cuando vuelve el internet
        connectionToast.textContent = "🟢 Conexión Restablecida - Sincronizando...";
        connectionToast.classList.add('online');
        connectionToast.classList.remove('hidden');
        
        // Ocultar la notificación después de 3 segundos
        setTimeout(() => {
            connectionToast.classList.add('hidden');
        }, 3000);
        
        // Intentar resincronizar inventario automáticamente
        getInventory(); 
    } else {
        // Lógica cuando se va el internet
        connectionToast.textContent = "🔴 Sin Conexión - Modo Offline Activo";
        connectionToast.classList.remove('online');
        connectionToast.classList.remove('hidden');
    }
}

// Listeners para detectar cambios en tiempo real
window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);


// ============================================================================
// 3. GESTIÓN DE INVENTARIO (MODELO HÍBRIDO)
// ============================================================================

/**
 * Obtiene la lista de materiales disponibles.
 * Implementa estrategia "Network First, falling back to Cache".
 * * 1. Si hay internet: Descarga de Firestore (Nube) y actualiza el caché local.
 * 2. Si no hay internet: Lee directamente del LocalStorage.
 * * @returns {Array} Lista de objetos de inventario.
 */
const getInventory = async () => {
    // INTENTO 1: CONEXIÓN A FIREBASE (ONLINE)
    if (navigator.onLine && window.db && window.firebase) {
        try {
            console.log("[Inventario] Intentando descargar de Firestore...");
            const { collection, getDocs } = window.firebase;
            
            // Referencia a la colección 'inventory'
            const querySnapshot = await getDocs(collection(window.db, "inventory"));
            
            const remoteData = [];
            querySnapshot.forEach((doc) => {
                // Combinamos el ID del documento con sus datos
                remoteData.push({ 
                    id: doc.id, 
                    ...doc.data() 
                });
            });
            
            // Guardamos la versión fresca en LocalStorage para uso futuro
            saveInventoryLocally(remoteData);
            console.log(`[Inventario] Sincronizado exitosamente: ${remoteData.length} items.`);
            return remoteData;
            
        } catch (error) { 
            console.warn("[Inventario] Error conectando a Firestore, cambiando a modo local:", error); 
        }
    }
    
    // INTENTO 2: MODO OFFLINE (LOCALSTORAGE)
    console.log("[Inventario] Cargando desde LocalStorage...");
    const localData = localStorage.getItem(INVENTORY_KEY);
    
    // Datos de respaldo (Seed Data) por si es la primera vez absoluta y no hay red
    const backupData = [
        { 
            id: "demo-1", 
            name: "Multímetro Digital (Demo)", 
            description: "Equipo precargado para demostración offline.", 
            available: 10, 
            total: 10, 
            tags: ["Laboratorio", "Demo"] 
        }
    ];
    
    return localData ? JSON.parse(localData) : backupData;
};

/**
 * Guarda el array de inventario en el almacenamiento del navegador.
 */
const saveInventoryLocally = (data) => {
    localStorage.setItem(INVENTORY_KEY, JSON.stringify(data));
};


// ============================================================================
// 4. GESTIÓN DEL CARRITO DE COMPRAS (LOCAL)
// ============================================================================

/**
 * Recupera el carrito actual del almacenamiento local.
 */
const getCart = () => {
    const cartJSON = localStorage.getItem(CART_KEY);
    return cartJSON ? JSON.parse(cartJSON) : [];
};

/**
 * Guarda el estado actual del carrito y actualiza la UI.
 */
const saveCart = (cart) => { 
    localStorage.setItem(CART_KEY, JSON.stringify(cart)); 
    updateCartUI(); // Refresca contadores en la barra de navegación
};

/**
 * Agrega un ítem al carrito validando existencias.
 * @param {string} id - ID del producto a agregar.
 */
const addToCart = async (id) => {
    const inventory = await getInventory();
    const product = inventory.find(p => p.id === id);
    
    if(!product) {
        alert("Error: El producto seleccionado no se encuentra en la base de datos local.");
        return;
    }

    let cart = getCart();
    let itemInCart = cart.find(i => i.id === id);

    if(itemInCart) {
        // Validar que no pida más de lo que hay disponible físicamente
        if(itemInCart.quantity < product.available) { 
            itemInCart.quantity++; 
            alert(`✅ Cantidad actualizada. Tienes ${itemInCart.quantity} unidades en la solicitud.`); 
        } else { 
            alert(`⚠️ Stock insuficiente. Solo hay ${product.available} unidades disponibles para préstamo.`); 
            return;
        }
    } else {
        // Nuevo ítem en el carrito
        cart.push({ 
            id: product.id, 
            name: product.name, 
            quantity: 1, 
            max: product.available // Guardamos el max para validaciones futuras en el formulario
        });
        alert(`✅ "${product.name}" agregado a la solicitud.`);
    }
    saveCart(cart);
};

/**
 * Elimina un ítem específico del carrito.
 */
const removeFromCart = (id) => {
    if(!confirm("¿Estás seguro de eliminar este artículo de la solicitud?")) return;
    
    let cart = getCart().filter(i => i.id !== id);
    saveCart(cart);
    
    // Si estamos en la vista del formulario, recargar para reflejar cambios visualmente
    if(document.getElementById('loan-form')) {
        renderRequestForm();
    }
};

/**
 * Vacía el carrito completo (usado al finalizar préstamo).
 */
const clearCart = () => {
    localStorage.removeItem(CART_KEY);
    updateCartUI();
};


// ============================================================================
// 5. SISTEMA DE AUTENTICACIÓN Y NAVEGACIÓN
// ============================================================================

/**
 * Inicializa la aplicación al cargar la página.
 */
window.initApp = function() {
    console.log("[App] Inicializando...");
    updateConnectionStatus();
    
    // Recuperar sesión persistente si existe
    const storedRole = localStorage.getItem('user_role');
    if(storedRole) {
        currentUserRole = storedRole;
        currentStudentId = localStorage.getItem('student_id') || '';
        console.log(`[Sesión] Usuario recuperado: ${currentUserRole}`);
        updateNav();
    }
};

/**
 * Actualiza la barra de navegación según el rol del usuario.
 */
const updateNav = () => {
    if(!appNav) return;

    if(currentUserRole === 'admin') {
        // MENÚ DE ADMINISTRADOR
        appNav.innerHTML = `
            <a href="#" onclick="navigateTo('admin_dashboard')">📊 Dashboard</a>
            <a href="#" onclick="navigateTo('admin_inventory')">📦 Inventario</a>
            <a href="#" onclick="navigateTo('admin_validate')">✅ Validar</a>
            <a href="#" onclick="navigateTo('admin_active_loans')">🔄 Activos</a>
            <a href="#" onclick="logout()" style="background-color:#D32F2F;">Salir</a>
        `;
        // Redirección automática si estamos en la pantalla de login
        if(document.getElementById('login-container')) navigateTo('admin_dashboard');
    } else if (currentUserRole === 'student') {
        // MENÚ DE ALUMNO
        appNav.innerHTML = `
            <a href="#" onclick="navigateTo('student_consult')">🔍 Material</a>
            <a href="#" onclick="navigateTo('student_request_form')">🛒 Solicitud (${getCart().length})</a>
            <a href="#" onclick="navigateTo('student_history')">📜 Historial</a>
            <a href="#" onclick="logout()" style="background-color:#D32F2F;">Salir</a>
        `;
        if(document.getElementById('login-container')) navigateTo('student_consult');
    }
};

/**
 * Maneja el inicio de sesión desde los inputs HTML.
 * @param {string} role - 'admin' o 'student'
 */
window.login = (role) => {
    // --- LOGIN ADMINISTRADOR ---
    if(role === 'admin') {
        const passInput = document.getElementById('login-admin-pass');
        let password = '';

        if (passInput) {
             password = passInput.value;
        } else {
             // Fallback por si se llama desde consola o error de carga
             password = prompt("Ingrese Contraseña de Administrador:");
        }

        if(password !== "utsjr2025") {
            alert("❌ Contraseña Incorrecta. Acceso Denegado.");
            return;
        }
    }
    
    // --- LOGIN ALUMNO ---
    if(role === 'student') {
        const idInput = document.getElementById('login-student-id');
        let matricula = '';

        if (idInput) {
             matricula = idInput.value.trim();
        } else {
             matricula = prompt("Por favor, ingresa tu Matrícula:", currentStudentId);
        }
        
        if(!matricula || matricula.length < 3) {
            alert("⚠️ Por favor ingresa una matrícula válida.");
            return;
        }
        
        currentStudentId = matricula;
        localStorage.setItem('student_id', matricula);
    }

    // Guardar sesión y actualizar interfaz
    currentUserRole = role;
    localStorage.setItem('user_role', role);
    updateNav();
};

/**
 * Cierra la sesión y limpia credenciales temporales.
 */
window.logout = () => {
    if(confirm("¿Seguro que deseas cerrar sesión?")) {
        currentUserRole = null;
        localStorage.removeItem('user_role');
        // No borramos student_id para comodidad del usuario en futuros accesos
        location.reload(); // Recarga limpia para borrar estados en memoria
    }
};

/**
 * Router SPA (Single Page Application).
 * Maneja el cambio de vistas sin recargar la página.
 */
window.navigateTo = async (view) => {
    // Mostrar spinner de carga
    mainContent.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:50px;">
            <div style="border: 4px solid #f3f3f3; border-top: 4px solid #1A237E; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite;"></div>
            <p style="margin-top:15px; color:#666;">Cargando contenido...</p>
            <style>@keyframes spin {0% {transform: rotate(0deg);} 100% {transform: rotate(360deg);}}</style>
        </div>
    `;
    
    // Pequeño delay para dar sensación de proceso (mejora UX)
    await new Promise(r => setTimeout(r, 100));

    try {
        switch(view) {
            // --- VISTAS ALUMNO ---
            case 'student_consult': 
                await renderStudentConsultation(); 
                break;
            case 'student_request_form': 
                renderRequestForm(); 
                break;
            case 'student_history': 
                await renderStudentHistory(); 
                break;
            
            // --- VISTAS ADMIN ---
            case 'admin_dashboard': 
                await renderAdminDashboard(); 
                break;
            case 'admin_inventory': 
                await renderAdminInventory(); 
                break;
            case 'admin_validate': 
                renderAdminValidate(); 
                break;
            case 'admin_active_loans': 
                await renderAdminActiveLoans(); 
                break;
            
            default: 
                mainContent.innerHTML = "<h2>Error 404: Vista no encontrada</h2><button onclick='location.reload()'>Volver al Inicio</button>";
        }
    } catch (error) {
        console.error("Error crítico en navegación:", error);
        mainContent.innerHTML = `<h2>Error al cargar la vista</h2><p>${error.message}</p>`;
    }
};


// ============================================================================
// 6. LÓGICA DE VISTAS: PERFIL ALUMNO
// ============================================================================

/**
 * Renderiza la vista de consulta de material con buscador.
 */
const renderStudentConsultation = async () => {
    const items = await getInventory();
    
    mainContent.innerHTML = `
        <h2>Consulta de Material</h2>
        <div class="search-container">
            <input type="text" id="search" class="search-input" placeholder="🔍 Buscar por nombre, carrera, etiqueta...">
        </div>
        
        <div id="list" class="inventory-list">
            <!-- Aquí se inyectan las tarjetas dinámicamente -->
        </div>
        
        <!-- Botón Flotante (FAB) -->
        <button id="fab-cart" onclick="navigateTo('student_request_form')">
            📋 Ver Solicitud (${getCart().length})
        </button>
    `;

    const drawList = (list) => {
        const container = document.getElementById('list');
        if(!list || list.length === 0) {
            container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:40px; color:#777;"><p>No se encontraron materiales con ese criterio.</p></div>`;
            return;
        }
        
        container.innerHTML = list.map(i => `
            <div class="material-card">
                <h3>${i.name}</h3>
                <p class="desc">${i.description || 'Sin descripción disponible.'}</p>
                
                <div class="tags-container">
                    ${i.tags ? i.tags.map(t=>`<span class="tag">${t}</span>`).join('') : ''}
                </div>
                
                <div style="margin-top:10px; display:flex; justify-content:space-between; align-items:center;">
                    <span class="${i.available > 0 ? 'available-in-stock':'available-out-stock'}">
                        Disp: <strong>${i.available}</strong> / ${i.total}
                    </span>
                </div>
                
                ${i.available > 0 ? 
                    `<button onclick="addToCart('${i.id}')">Agregar a Solicitud</button>` : 
                    '<button disabled style="background:#ccc; cursor:not-allowed;">Agotado</button>'}
            </div>`).join('');
    };

    // Carga inicial de la lista
    drawList(items);

    // Evento de búsqueda en tiempo real
    const searchInput = document.getElementById('search');
    if(searchInput) {
        searchInput.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
            const filtered = items.filter(i => 
                (i.name && i.name.toLowerCase().includes(q)) || 
                (i.tags && i.tags.some(t => t.toLowerCase().includes(q)))
            );
            drawList(filtered);
        });
    }
    
    updateCartUI();
};

const updateCartUI = () => {
    // Actualizar texto del botón del menú si estamos en modo alumno
    const links = document.querySelectorAll('nav a');
    if(links.length > 1 && currentUserRole === 'student') {
        links[1].innerText = `Solicitud (${getCart().length})`;
    }
    // Actualizar botón flotante si existe en la vista actual
    const fab = document.getElementById('fab-cart');
    if(fab) fab.innerText = `📋 Ver Solicitud (${getCart().length})`;
};

/**
 * Renderiza el formulario detallado de préstamo.
 */
const renderRequestForm = () => {
    const cart = getCart();
    
    // Si el carrito está vacío, mostramos mensaje y botón de regreso
    if(cart.length === 0) {
        mainContent.innerHTML = `
            <div style="text-align:center; margin-top:50px; padding:20px;">
                <h2 style="color:#ccc; font-size:3em;">🛒</h2>
                <h2>Tu solicitud está vacía</h2>
                <p>Regresa al inventario para seleccionar materiales.</p>
                <button class="btn-primary" onclick="navigateTo('student_consult')" style="width:auto; margin-top:20px;">Ir al Inventario</button>
            </div>
        `;
        return;
    }
    
    // Fecha sugerida (hoy)
    const today = new Date().toISOString().split('T')[0];

    mainContent.innerHTML = `
        <h2>Completar Solicitud de Préstamo</h2>
        
        <div class="request-container">
            <!-- Columna 1: Lista de Materiales -->
            <div class="cart-section">
                <h3>1. Materiales Seleccionados</h3>
                <ul style="list-style:none; padding:0;">
                    ${cart.map(i => `
                        <li style="border-bottom:1px solid #eee; padding:15px 0; display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <strong style="color:#1A237E; font-size:1.1em;">${i.name}</strong><br>
                                <small>Cantidad solicitada: <strong>${i.quantity}</strong></small>
                            </div>
                            <button class="btn-remove" onclick="removeFromCart('${i.id}')" title="Eliminar">🗑️</button>
                        </li>
                    `).join('')}
                </ul>
                <button class="btn-secondary" onclick="navigateTo('student_consult')" style="margin-top:15px;">+ Agregar más material</button>
            </div>

            <!-- Columna 2: Formulario Administrativo Completo -->
            <div class="form-section">
                <h3>2. Datos del Préstamo</h3>
                <form id="loan-form">
                    <label>Nombre Completo del Alumno:</label>
                    <input type="text" id="s-name" placeholder="Ej: Juan Pérez" required>

                    <label>Número de Matrícula:</label>
                    <input type="text" id="s-id" value="${currentStudentId}" required readonly style="background:#f0f0f0; cursor:not-allowed; color:#555;">

                    <div class="form-row">
                        <div>
                            <label>Fecha:</label>
                            <input type="date" id="s-date" value="${today}" required>
                        </div>
                        <div>
                            <label>Horario (Inicio-Fin):</label>
                            <input type="text" id="s-time" placeholder="Ej: 10:00 - 12:00" required>
                        </div>
                    </div>

                    <label>Aula / Laboratorio:</label>
                    <input type="text" id="s-aula" placeholder="Ej: Lab de Redes, A-12" required>

                    <label>Profesor Responsable:</label>
                    <input type="text" id="s-prof" placeholder="Nombre del Docente" required>

                    <button type="submit" class="btn-primary" style="margin-top:20px; padding:15px; font-size:1.1em;">Generar Token de Entrega</button>
                </form>
            </div>
        </div>
        
        <!-- ÁREA DE RESULTADO (TOKEN/QR) -->
        <div id="result-area" style="display:none; text-align:center; margin-top:30px; background:white; padding:30px; border-radius:8px; box-shadow:0 4px 15px rgba(0,0,0,0.2);">
            <!-- Se inyecta dinámicamente tras procesar la solicitud -->
        </div>
    `;

    // Manejo del envío del formulario
    document.getElementById('loan-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Recopilar todos los datos del formulario
        const requestData = {
            studentName: document.getElementById('s-name').value,
            studentId: currentStudentId,
            date: document.getElementById('s-date').value,
            time: document.getElementById('s-time').value,
            aula: document.getElementById('s-aula').value,
            professor: document.getElementById('s-prof').value,
            items: cart,
            timestamp: Date.now()
        };

        // UI de carga
        const resultArea = document.getElementById('result-area');
        document.querySelector('.request-container').style.display = 'none';
        resultArea.style.display = 'block';
        resultArea.innerHTML = `
            <div style="padding:20px;">
                <h3>Procesando solicitud...</h3>
                <p>Contactando con el servidor...</p>
            </div>`;

        // ESTRATEGIA HÍBRIDA: NUBE vs LOCAL
        let generatedCode = null;
        let isOnline = false;

        // INTENTO ONLINE: Guardar en 'requests' y obtener Código Corto
        if (navigator.onLine && window.db && window.firebase) {
            try {
                // Generar Código Corto (Ej: P-4821)
                const shortCode = "P-" + Math.floor(1000 + Math.random() * 9000);
                const { collection, addDoc } = window.firebase;
                
                await addDoc(collection(window.db, "requests"), {
                    ...requestData,
                    code: shortCode,
                    status: 'pending'
                });

                generatedCode = shortCode;
                isOnline = true;

            } catch (err) { 
                console.warn("Fallo subida online, cambiando a modo offline.", err); 
                isOnline = false;
            }
        }

        // RENDERIZAR RESULTADO SEGÚN CONECTIVIDAD
        if (isOnline) {
            // Opción A: Éxito Online (Código Corto)
            resultArea.innerHTML = `
                <h2 style="color:#009688; font-size:2em;">✅ Solicitud Enviada</h2>
                <p style="font-size:1.2em;">Entrega este código de verificación al encargado:</p>
                
                <div class="big-code">${generatedCode}</div>
                
                <p style="font-size:0.9em; color:#666; margin-top:20px;">
                    Tu solicitud con ${cart.length} materiales ha sido guardada en la nube. <br>
                    El encargado la verá en su pantalla al ingresar el código.
                </p>
                <button onclick="finishStudentProcess()" class="btn-secondary" style="margin-top:20px;">Finalizar y Salir</button>
            `;
        } else {
            // Opción B: Fallback Offline (Token JSON Texto)
            const jsonStr = JSON.stringify(requestData);
            
            resultArea.innerHTML = `
                <h2 style="color:#E65100; font-size:2em;">⚠️ Modo Sin Conexión</h2>
                <p>No se pudo conectar al servidor. Se ha generado un Token Local.</p>
                
                <div style="background:#FFF3E0; padding:15px; border-radius:8px; margin:20px 0; text-align:left;">
                    <p style="font-weight:bold; margin-top:0;">Instrucciones:</p>
                    <ol>
                        <li>Copia el texto de abajo (Botón "Copiar").</li>
                        <li>El encargado seleccionará "Opción B" en su sistema.</li>
                        <li>Pégale el texto para que valide tu préstamo.</li>
                    </ol>
                </div>
                
                <textarea id="offline-token" style="width:100%; height:80px; font-family:monospace; font-size:0.8em;" readonly>${jsonStr}</textarea>
                
                <div style="display:flex; gap:10px; justify-content:center; margin-top:10px;">
                    <button onclick="copyToken()" class="btn-primary" style="background:#E65100;">Copiar Token</button>
                    <button onclick="finishStudentProcess()" class="btn-secondary">Finalizar</button>
                </div>
            `;
        }
    });
};

/**
 * Copia el token al portapapeles.
 */
window.copyToken = () => {
    const textArea = document.getElementById('offline-token');
    textArea.select();
    navigator.clipboard.writeText(textArea.value).then(() => alert("✅ Token copiado al portapapeles."));
};

window.finishStudentProcess = () => { 
    clearCart(); 
    navigateTo('student_consult'); 
};

/**
 * Vista de Historial del Alumno.
 */
const renderStudentHistory = async () => {
    mainContent.innerHTML = `<h2>Historial de Préstamos</h2><p>Cargando registros...</p>`;
    
    if (!currentStudentId) { 
        mainContent.innerHTML = `<div style="text-align:center; padding:30px;"><p>No hay matrícula registrada. Por favor, cierra sesión e ingresa tu matrícula.</p></div>`; 
        return; 
    }

    if (navigator.onLine && window.db && window.firebase) {
        try {
            const { collection, query, where, getDocs } = window.firebase;
            // Buscar préstamos donde studentId == currentStudentId
            const q = query(collection(window.db, "loans"), where("studentId", "==", currentStudentId));
            const snap = await getDocs(q);
            const history = [];
            snap.forEach(d => history.push({id:d.id, ...d.data()}));
            
            // Ordenar por fecha descendente (más reciente primero)
            history.sort((a, b) => b.timestamp - a.timestamp);

            if (history.length === 0) {
                mainContent.innerHTML = `<h2>Historial</h2><p style="text-align:center; margin-top:20px;">No se encontraron préstamos registrados con la matrícula ${currentStudentId}.</p>`;
                return;
            }

            mainContent.innerHTML = `
                <h2>Historial de Préstamos</h2>
                <div class="history-list">
                    ${history.map(loan => `
                        <div class="material-card history-card">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                                <strong>📅 ${new Date(loan.timestamp).toLocaleDateString()}</strong>
                                <span class="tag" style="background:${loan.status==='active'?'#FFEB3B':'#C8E6C9'}; color:#333;">
                                    ${loan.status==='active'?'⏳ En Curso':'✅ Devuelto'}
                                </span>
                            </div>
                            <p style="margin:0; font-size:0.9em;"><strong>Aula:</strong> ${loan.aula}</p>
                            <p style="margin:0 0 10px 0; font-size:0.9em;"><strong>Profesor:</strong> ${loan.professor || 'No especificado'}</p>
                            <hr style="border:0; border-top:1px solid #eee;">
                            <ul style="padding-left:20px; margin-bottom:0; color:#555;">
                                ${loan.items.map(i => `<li>${i.name} (x${i.quantity})</li>`).join('')}
                            </ul>
                        </div>
                    `).join('')}
                </div>`;
        } catch (error) { 
            console.error(error);
            mainContent.innerHTML = `<div style="text-align:center; padding:20px;"><p>❌ Error al conectar con el servidor de historial.</p></div>`; 
        }
    } else { 
        mainContent.innerHTML = `<div style="text-align:center; padding:20px;"><p>🚫 <strong>Modo Offline:</strong> El historial histórico no está disponible sin conexión a internet.</p></div>`; 
    }
};


// ============================================================================
// 7. LÓGICA DE VISTAS: PERFIL ADMINISTRADOR
// ============================================================================

// --- VALIDACIÓN DE PRÉSTAMOS (PUNTO DE ENTREGA) ---
const renderAdminValidate = () => {
    mainContent.innerHTML = `
        <h2>✅ Validar y Entregar Préstamo</h2>
        
        <div class="admin-form">
            <!-- OPCIÓN A: CÓDIGO CORTO (ONLINE) -->
            <div style="background:#E8F5E9; padding:15px; border-radius:8px; margin-bottom:20px; border: 1px solid #C8E6C9;">
                <h3 style="margin-top:0; color:#2E7D32;">Opción A: Código Online</h3>
                <p style="font-size:0.9em; margin-bottom:10px;">Ingresa el código corto que le apareció al alumno (Ej: P-1234).</p>
                <div style="display:flex; gap:10px;">
                    <input type="text" id="verify-code" placeholder="P-XXXX" style="font-size:1.5em; text-align:center; text-transform:uppercase; font-weight:bold;">
                    <button onclick="searchByCode()" class="btn-primary" style="width:auto;">Buscar</button>
                </div>
            </div>

            <!-- OPCIÓN B: TOKEN OFFLINE (TEXTO) -->
            <div style="background:#FFF3E0; padding:15px; border-radius:8px; border: 1px solid #FFE0B2;">
                <h3 style="margin-top:0; color:#E65100;">Opción B: Token Offline</h3>
                <p style="font-size:0.9em; margin-bottom:10px;">Si el alumno no tiene internet, pega aquí el token de texto que generó su celular:</p>
                <textarea id="qr-input" rows="3" placeholder='Pegar Token JSON aquí...' style="font-family:monospace; font-size:0.8em; width:100%;"></textarea>
                <button onclick="processJSON()" class="btn-secondary" style="margin-top:10px;">Validar Token</button>
            </div>
        </div>

        <!-- Contenedor de resultados -->
        <div id="loan-result"></div>
    `;
};

/**
 * Busca una solicitud por Código Corto en Firestore.
 */
window.searchByCode = async () => {
    const code = document.getElementById('verify-code').value.toUpperCase().trim();
    if(!code) return alert("Por favor escribe un código.");

    if (navigator.onLine && window.db && window.firebase) {
        try {
            const { collection, query, where, getDocs } = window.firebase;
            const q = query(collection(window.db, "requests"), where("code", "==", code), where("status", "==", "pending"));
            const snap = await getDocs(q);

            if (!snap.empty) {
                const docData = snap.docs[0].data();
                const requestDocId = snap.docs[0].id;
                // Mostrar vista de confirmación
                showConfirmation({ ...docData, requestDocId });
            } else {
                alert("❌ Código no encontrado o la solicitud ya fue procesada.");
            }
        } catch (error) { 
            console.error(error);
            alert("Error de conexión al buscar el código."); 
        }
    } else {
        alert("⚠️ Necesitas internet para validar por código corto. Usa la opción B (Token).");
    }
};

/**
 * Procesa el JSON pegado manualmente (Opción Offline).
 */
window.processJSON = () => {
    try { 
        const raw = document.getElementById('qr-input').value;
        if(!raw) return alert("El campo está vacío.");
        const data = JSON.parse(raw);
        showConfirmation(data);
    } 
    catch (e) { alert("❌ El texto pegado no es un token válido."); }
};

/**
 * Muestra el resumen de la solicitud para confirmar.
 */
const showConfirmation = async (data) => {
    const resultDiv = document.getElementById('loan-result');
    resultDiv.innerHTML = `<p>Verificando existencias...</p>`;
    
    let html = `
        <div style="background:white; padding:20px; border-radius:8px; margin-top:30px; border:2px solid #1A237E; box-shadow:0 5px 15px rgba(0,0,0,0.2);">
            <h3 style="margin-top:0; color:#1A237E;">Confirmar Entrega de Material</h3>
            
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:0.9em; margin-bottom:15px; background:#f9f9f9; padding:10px; border-radius:5px;">
                <div><strong>Alumno:</strong> ${data.studentName}</div>
                <div><strong>Matrícula:</strong> ${data.studentId}</div>
                <div><strong>Aula:</strong> ${data.aula}</div>
                <div><strong>Profesor:</strong> ${data.professor}</div>
                <div style="grid-column: 1/-1;"><strong>Horario:</strong> ${data.time}</div>
            </div>
            
            <hr>
            <h4>Materiales Solicitados:</h4>
            <ul style="list-style:none; padding:0;">`;
    
    let canApprove = true;
    
    // VALIDACIÓN DE STOCK EN TIEMPO REAL
    if (navigator.onLine && window.db && window.firebase) {
        const { doc, getDoc } = window.firebase;
        
        for (let item of data.items) {
            const ref = doc(window.db, "inventory", item.id);
            const snap = await getDoc(ref);
            
            if (snap.exists()) {
                const currentStock = snap.data().available;
                if (currentStock >= item.quantity) {
                    html += `<li style="color:green; padding:8px 0; border-bottom:1px solid #eee;">
                        ✅ <strong>${item.name}</strong> <br> 
                        Solicita: ${item.quantity} | Stock Actual: ${currentStock}
                    </li>`;
                } else {
                    html += `<li style="color:red; padding:8px 0; border-bottom:1px solid #eee; background:#FFEBEE;">
                        ❌ <strong>${item.name}</strong> <br> 
                        Solicita: ${item.quantity} | Stock INSUFICIENTE: ${currentStock}
                    </li>`;
                    canApprove = false;
                }
            } else {
                 html += `<li style="color:orange; padding:8px 0;">⚠️ <strong>${item.name}</strong>: No encontrado en BD (Posible ID local)</li>`;
                 canApprove = false; 
            }
        }
    } else {
        html += "<p style='color:red; font-weight:bold; background:#FFEBEE; padding:10px;'>⚠️ Sin conexión a internet. No se puede validar el stock real.</p>";
        canApprove = false;
    }
    
    html += `</ul>`;
    
    if (canApprove) {
        window.tempLoanData = data; 
        html += `<button onclick="confirmLoan()" class="btn-primary" style="background:#2E7D32; margin-top:15px; padding:15px; font-size:1.2em;">✅ CONFIRMAR Y ENTREGAR</button>`;
    } else {
        html += `<button disabled style="background:#ccc; color:#666; width:100%; padding:10px; cursor:not-allowed; margin-top:15px;">⛔ No se puede aprobar (Stock insuficiente o Error)</button>`;
    }
    
    html += `</div>`;
    resultDiv.innerHTML = html;
    resultDiv.scrollIntoView({ behavior: 'smooth' });
};

/**
 * Ejecuta la transacción de préstamo en la BD.
 */
window.confirmLoan = async () => {
    const data = window.tempLoanData;
    if (!data) return;

    if (window.db && window.firebase) {
        const { doc, getDoc, updateDoc, addDoc, collection, deleteDoc } = window.firebase;
        try {
            // 1. Descontar Inventario
            for (let item of data.items) {
                const ref = doc(window.db, "inventory", item.id);
                const snap = await getDoc(ref);
                if (snap.exists()) {
                    await updateDoc(ref, { available: snap.data().available - item.quantity });
                }
            }

            // 2. Guardar Registro en 'loans'
            await addDoc(collection(window.db, "loans"), {
                ...data, 
                timestamp: Date.now(),
                status: 'active'
            });

            // 3. Borrar solicitud temporal si existe
            if (data.requestDocId) {
                await deleteDoc(doc(window.db, "requests", data.requestDocId));
            }

            alert("✅ Préstamo Registrado Exitosamente.");
            window.tempLoanData = null;
            document.getElementById('loan-result').innerHTML = '';
            navigateTo('admin_dashboard');
            
        } catch (e) { 
            console.error(e); 
            alert("Error crítico al actualizar la base de datos."); 
        }
    }
};

// --- GESTIÓN DE PRÉSTAMOS ACTIVOS Y DEVOLUCIÓN ---
const renderAdminActiveLoans = async () => {
    mainContent.innerHTML = `<h2>Préstamos Activos</h2><p>Cargando...</p>`;
    
    if (navigator.onLine && window.db && window.firebase) {
        try {
            const { collection, query, where, getDocs } = window.firebase;
            // Buscar solo los que tienen status 'active'
            const q = query(collection(window.db, "loans"), where("status", "==", "active"));
            const snap = await getDocs(q);
            
            if (snap.empty) {
                mainContent.innerHTML = `<h2>Préstamos Activos</h2><p>No hay material prestado actualmente.</p>`;
                return;
            }

            const loans = [];
            snap.forEach(doc => loans.push({ id: doc.id, ...doc.data() }));

            mainContent.innerHTML = `
                <h2>Préstamos Activos (${loans.length})</h2>
                <div class="history-list">
                    ${loans.map(loan => `
                        <div class="material-card" style="border-left: 5px solid #FF9800; position:relative;">
                            <div style="display:flex; justify-content:space-between;">
                                <strong>${loan.studentName}</strong>
                                <small>${new Date(loan.timestamp).toLocaleDateString()}</small>
                            </div>
                            <p style="margin:5px 0; font-size:0.9em;"><strong>${loan.studentId}</strong> | Aula: ${loan.aula}</p>
                            <p style="margin:0; font-size:0.8em; color:#666;">Prof: ${loan.professor}</p>
                            <hr style="margin:5px 0; border:0; border-top:1px dashed #ccc;">
                            <ul style="padding-left:20px; margin:5px 0; font-size:0.9em; color:#333;">
                                ${loan.items.map(i => `<li>${i.name} (x${i.quantity})</li>`).join('')}
                            </ul>
                            <button onclick="returnLoan('${loan.id}')" class="btn-primary" style="background:#D32F2F; margin-top:10px; font-size:0.9em;">🛑 TERMINAR Y DEVOLVER STOCK</button>
                        </div>
                    `).join('')}
                </div>`;
        } catch (e) { 
            console.error(e);
            mainContent.innerHTML = `<p>Error de conexión.</p>`; 
        }
    } else {
        mainContent.innerHTML = `<p>Necesitas internet para gestionar devoluciones.</p>`;
    }
};

// Función para procesar la devolución
window.returnLoan = async (loanId) => {
    if (!confirm("¿Confirmar que el alumno devolvió todo el material?")) return;

    if (window.db && window.firebase) {
        const { doc, getDoc, updateDoc } = window.firebase;
        try {
            // 1. Obtener datos del préstamo
            const loanRef = doc(window.db, "loans", loanId);
            const loanSnap = await getDoc(loanRef);
            
            if (!loanSnap.exists()) return alert("Error: Préstamo no encontrado.");
            const loanData = loanSnap.data();

            // 2. Devolver stock al inventario
            for (let item of loanData.items) {
                const productRef = doc(window.db, "inventory", item.id);
                const productSnap = await getDoc(productRef);
                
                if (productSnap.exists()) {
                    const currentStock = productSnap.data().available;
                    await updateDoc(productRef, { available: currentStock + item.quantity });
                }
            }

            // 3. Actualizar estado a 'returned'
            await updateDoc(loanRef, { status: 'returned', returnDate: Date.now() });

            alert("✅ Material devuelto y stock actualizado.");
            renderAdminActiveLoans(); // Recargar la lista

        } catch (e) {
            console.error(e);
            alert("Error al procesar la devolución.");
        }
    }
};

// --- ADMIN DASHBOARD ---
const renderAdminDashboard = async () => {
    // Gráfica Simulada (Datos Ficticios para Demo)
    const weeklyData = [
        { d: 'L', v: 12 }, { d: 'M', v: 19 }, { d: 'X', v: 8 }, { d: 'J', v: 15 }, { d: 'V', v: 22 }
    ];
    const max = 22;
    
    const barsHtml = weeklyData.map((item, i) => `
        <div class="chart-bar-container">
            <div class="chart-bar ${i==4?'bar-peak':''}" style="height:${(item.v/max)*100}%;">
                <span class="chart-tooltip">${item.v}</span>
            </div>
            <span class="chart-label">${item.d}</span>
        </div>`).join('');

    // Datos reales simples
    const inv = await getInventory();
    const lowStock = inv.filter(i => i.available < 2).length;

    mainContent.innerHTML = `
        <h2>Dashboard de Almacén</h2>
        <div class="dashboard-grid">
            <div class="kpi-card">
                <h3>${lowStock}</h3>
                <p>⚠️ Stock Bajo</p>
            </div>
            <div class="kpi-card highlight">
                <h3>Viernes</h3>
                <p>📅 Día Pico</p>
            </div>
        </div>
        
        <div class="chart-section">
            <h3>Actividad Semanal</h3>
            <div class="chart-container">
                ${barsHtml}
            </div>
        </div>

        <div style="margin-top: 20px; text-align: center;">
            <button onclick="navigateTo('admin_validate')" class="btn-primary" style="max-width: 300px;">
                🔍 Validar Nuevo Préstamo
            </button>
        </div>
    `;
};

// --- ADMIN GESTIÓN DE INVENTARIO (ALTA Y REABASTECIMIENTO) ---
const renderAdminInventory = async () => {
    mainContent.innerHTML = `
        <h2>Gestión Inventario</h2>
        
        <form id="add-form" class="admin-form">
            <h3>Alta de Nuevo Material</h3>
            <label>Nombre:</label><input type="text" id="m-name" required>
            <label>Descripción:</label><input type="text" id="m-desc" required>
            
            <div class="form-row">
                <div><label>Stock Total:</label><input type="number" id="m-total" min="1" required></div>
            </div>
            
            <label>Etiquetas (Tags):</label>
            <input type="text" id="m-tags" placeholder="Ej: Lab Electrónica, Mecatrónica, Cables">
            <small style="color:#666;">Separa las etiquetas con comas.</small>
            
            <button type="submit" class="btn-primary" style="margin-top:15px;">Guardar Material</button>
        </form>
        
        <h3>Inventario Actual</h3>
        <div id="adm-list" class="inventory-list"></div>
    `;
    
    const items = await getInventory();
    document.getElementById('adm-list').innerHTML = items.map(i => `
        <div class="material-card">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0;">${i.name}</h3>
                <!-- BOTÓN NUEVO: REABASTECER -->
                <button onclick="addStockToProduct('${i.id}', '${i.name}')" style="width:auto; padding:5px 10px; background:#0288D1; font-size:0.9em; margin-top:0;">➕ Stock</button>
            </div>
            <p><strong>Disp:</strong> ${i.available} / ${i.total}</p>
            <div class="tags-container">
                ${i.tags ? i.tags.map(t=>`<span class="tag">${t}</span>`).join('') : ''}
            </div>
        </div>
    `).join('');
    
    document.getElementById('add-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const tagsInput = document.getElementById('m-tags').value;
        const newItem = {
            name: document.getElementById('m-name').value,
            description: document.getElementById('m-desc').value,
            total: parseInt(document.getElementById('m-total').value),
            available: parseInt(document.getElementById('m-total').value),
            tags: tagsInput.split(',').map(t => t.trim()).filter(t => t !== "")
        };

        if(navigator.onLine && window.db && window.firebase) {
             try {
                 await window.firebase.addDoc(window.firebase.collection(window.db, "inventory"), newItem);
                 alert("✅ Material guardado en la Nube.");
                 await renderAdminInventory(); // Recargar vista
             } catch(err) {
                 console.error(err);
                 alert("❌ Error al guardar en Firebase.");
             }
        } else {
            alert("⚠️ No se puede añadir material en modo Offline. Conéctate para gestionar el inventario.");
        }
    });
};

// FUNCIÓN: AÑADIR STOCK A EXISTENTE
window.addStockToProduct = async (id, name) => {
    const qtyStr = prompt(`¿Cuántas unidades nuevas llegaron de "${name}"?`);
    if (!qtyStr) return;
    const qty = parseInt(qtyStr);
    
    if (isNaN(qty) || qty <= 0) return alert("Cantidad inválida");

    if (navigator.onLine && window.db && window.firebase) {
        const { doc, getDoc, updateDoc } = window.firebase;
        try {
            const ref = doc(window.db, "inventory", id);
            const snap = await getDoc(ref);
            if (snap.exists()) {
                const currentTotal = snap.data().total || 0;
                const currentAvail = snap.data().available || 0;
                
                await updateDoc(ref, {
                    total: currentTotal + qty,
                    available: currentAvail + qty
                });
                
                alert(`✅ Se agregaron ${qty} unidades al inventario.`);
                renderAdminInventory(); // Recargar vista
            }
        } catch (e) {
            console.error(e);
            alert("Error al actualizar stock en la nube.");
        }
    } else {
        alert("Necesitas internet para actualizar el stock.");
    }
};

// --------------------------------------------------------------------------------
// 8. REGISTRO DEL SERVICE WORKER
// --------------------------------------------------------------------------------
if('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}