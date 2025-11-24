// --------------------------------------------------------------------------------
// 1. VARIABLES GLOBALES Y CONFIGURACIÓN
// --------------------------------------------------------------------------------
const mainContent = document.getElementById('content');
let currentUserRole = null; 
// Mantenemos la matrícula en memoria para no pedirla a cada rato
let currentStudentId = localStorage.getItem('student_id') || '';

// Claves para el almacenamiento local (Offline)
const INVENTORY_KEY = 'unistock_inventory';
const CART_KEY = 'unistock_loan_cart';

// --------------------------------------------------------------------------------
// 2. INDICADOR DE CONEXIÓN
// --------------------------------------------------------------------------------
function updateConnectionStatus() {
    const toast = document.getElementById('connection-toast');
    if(!toast) return; // Protección si el elemento no existe aún

    if (navigator.onLine) {
        toast.textContent = "🟢 Conexión Restablecida";
        toast.classList.add('online');
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 3000);
    } else {
        toast.textContent = "🔴 Sin Conexión - Modo Offline";
        toast.classList.remove('online');
        toast.classList.remove('hidden');
    }
}

window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);

// --------------------------------------------------------------------------------
// 3. GESTIÓN DE INVENTARIO (HÍBRIDO: NUBE + LOCAL)
// --------------------------------------------------------------------------------

/**
 * Obtiene el inventario. 
 * Prioridad 1: Firestore (Si hay internet). Sincroniza y guarda en local.
 * Prioridad 2: LocalStorage (Si no hay internet).
 */
const getInventory = async () => {
    // Intentar conexión Online
    if (navigator.onLine && window.db && window.firebase) {
        try {
            const { collection, getDocs } = window.firebase;
            const querySnapshot = await getDocs(collection(window.db, "inventory"));
            const remoteData = [];
            querySnapshot.forEach((doc) => {
                // Guardamos ID de Firestore y los datos
                remoteData.push({ id: doc.id, ...doc.data() });
            });
            
            // ÉXITO ONLINE: Actualizamos el respaldo local
            saveInventory(remoteData);
            console.log("Inventario sincronizado desde la Nube.");
            return remoteData;
            
        } catch (error) { 
            console.warn("Modo Offline activado: No se pudo conectar a Firestore.", error); 
        }
    }
    
    // Fallback Offline
    console.log("Cargando inventario desde caché local.");
    const local = localStorage.getItem(INVENTORY_KEY);
    
    // Datos de respaldo por si es la primera vez que se abre la app y no hay internet
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
    
    return local ? JSON.parse(local) : backupData;
};

const saveInventory = (data) => {
    localStorage.setItem(INVENTORY_KEY, JSON.stringify(data));
};

// --------------------------------------------------------------------------------
// 4. GESTIÓN DEL CARRITO DE COMPRAS (LOCAL)
// --------------------------------------------------------------------------------

const getCart = () => {
    const cart = localStorage.getItem(CART_KEY);
    return cart ? JSON.parse(cart) : [];
};

const saveCart = (cart) => { 
    localStorage.setItem(CART_KEY, JSON.stringify(cart)); 
    updateCartUI(); // Actualiza el contador en la barra de navegación
};

const addToCart = async (id) => {
    const inventory = await getInventory();
    const product = inventory.find(p => p.id === id);
    
    if(!product) return alert("Error: Producto no encontrado.");

    let cart = getCart();
    let item = cart.find(i => i.id === id);

    if(item) {
        // Validar que no pida más de lo que hay disponible
        if(item.quantity < product.available) { 
            item.quantity++; 
            alert(`Cantidad actualizada: ${item.quantity} unidades.`); 
        } else { 
            alert(`Stock insuficiente. Solo hay ${product.available} disponibles.`); 
            return;
        }
    } else {
        // Nuevo item en el carrito
        cart.push({ 
            id: product.id, 
            name: product.name, 
            quantity: 1, 
            max: product.available // Guardamos el max para validaciones en el formulario
        });
        alert("Material agregado a la solicitud.");
    }
    saveCart(cart);
};

const removeFromCart = (id) => {
    let cart = getCart().filter(i => i.id !== id);
    saveCart(cart);
    // Si estamos en la vista del formulario, recargamos para reflejar cambios
    // Verificamos si el elemento existe para evitar errores si estamos en otra vista
    if(document.getElementById('loan-form')) {
        renderRequestForm();
    }
};

const clearCart = () => {
    localStorage.removeItem(CART_KEY);
    updateCartUI();
};

// --------------------------------------------------------------------------------
// 5. SISTEMA DE LOGIN, NAVEGACIÓN Y PERFILES
// --------------------------------------------------------------------------------

window.initApp = function() {
    updateConnectionStatus();
    // Verificar si ya hay una sesión guardada
    if(localStorage.getItem('user_role')) {
        currentUserRole = localStorage.getItem('user_role');
        // Recuperamos matrícula guardada si es alumno
        currentStudentId = localStorage.getItem('student_id') || '';
        updateNav();
    }
};

const updateNav = () => {
    const nav = document.getElementById('app-nav');
    if(!nav) return;

    if(currentUserRole === 'admin') {
        nav.innerHTML = `
            <a href="#" onclick="navigateTo('admin_dashboard')">Dashboard</a>
            <a href="#" onclick="navigateTo('admin_inventory')">Inventario</a>
            <a href="#" onclick="navigateTo('admin_validate')">✅ Validar</a>
            <a href="#" onclick="logout()">Salir</a>`;
        // Redirigir al dashboard si acabamos de loguear y estamos en login
        if(document.getElementById('login-container')) navigateTo('admin_dashboard');
    } else {
        nav.innerHTML = `
            <a href="#" onclick="navigateTo('student_consult')">Material</a>
            <a href="#" onclick="navigateTo('student_request_form')">Solicitud (${getCart().length})</a>
            <a href="#" onclick="navigateTo('student_history')">📜 Historial</a>
            <a href="#" onclick="logout()">Salir</a>`;
        if(document.getElementById('login-container')) navigateTo('student_consult');
    }
};

window.login = (role) => {
    // Lógica para tomar valores de los inputs en lugar de prompt (Versión Móvil Amigable)
    if(role === 'admin') {
        const passInput = document.getElementById('login-admin-pass');
        // Si no existen los inputs (por ejemplo, login desde consola), usamos prompt como fallback
        if (!passInput) {
             const pass = prompt("Ingrese Contraseña de Administrador:");
             if(pass !== "utsjr2025") return alert("Contraseña Incorrecta.");
        } else {
             const password = passInput.value;
             if(password !== "utsjr2025") {
                alert("Contraseña Incorrecta");
                return;
             }
        }
    }
    
    if(role === 'student') {
        const idInput = document.getElementById('login-student-id');
        let matricula = '';
        
        if (!idInput) {
             matricula = prompt("Por favor, ingresa tu Matrícula:", currentStudentId);
             if (!matricula) return;
        } else {
             matricula = idInput.value.trim();
             if(!matricula) {
                alert("Por favor ingresa tu matrícula");
                return;
             }
        }
        
        currentStudentId = matricula;
        localStorage.setItem('student_id', matricula);
    }

    currentUserRole = role;
    localStorage.setItem('user_role', role);
    updateNav();
};

window.logout = () => {
    currentUserRole = null;
    localStorage.removeItem('user_role');
    // No borramos student_id para comodidad del usuario en el futuro
    location.reload(); // Recarga completa para limpiar memoria
};

// Router simple para SPA (Single Page Application)
window.navigateTo = async (view) => {
    // Indicador de carga simple
    mainContent.innerHTML = '<div style="text-align:center; padding:50px; color:#666;"><h2>Cargando...</h2></div>';
    
    // Pequeño delay para dar sensación de proceso (opcional)
    await new Promise(r => setTimeout(r, 50));

    switch(view) {
        // Vistas Alumno
        case 'student_consult': 
            await renderStudentConsultation(); 
            break;
        case 'student_request_form': 
            renderRequestForm(); 
            break;
        case 'student_history': 
            await renderStudentHistory(); 
            break;
            
        // Vistas Admin
        case 'admin_dashboard': 
            renderAdminDashboard(); 
            break;
        case 'admin_inventory': 
            await renderAdminInventory(); 
            break;
        case 'admin_validate': 
            renderAdminValidate(); 
            break;
            
        default: 
            mainContent.innerHTML = "<h2>Error 404: Vista no encontrada</h2>";
    }
};

// --------------------------------------------------------------------------------
// 6. VISTAS DEL ALUMNO
// --------------------------------------------------------------------------------

// --- VISTA DE CONSULTA Y BÚSQUEDA ---
const renderStudentConsultation = async () => {
    const items = await getInventory();
    
    mainContent.innerHTML = `
        <h2>Consulta de Material</h2>
        <div class="search-container">
            <input type="text" id="search" class="search-input" placeholder="🔍 Buscar por nombre, carrera, etiqueta...">
        </div>
        
        <div id="list" class="inventory-list">
            <!-- Aquí se inyectan las tarjetas -->
        </div>
        
        <!-- Botón Flotante (FAB) -->
        <button id="fab-cart" onclick="navigateTo('student_request_form')">
            📋 Ver Solicitud
        </button>
    `;

    const drawList = (list) => {
        const container = document.getElementById('list');
        if(list.length === 0) {
            container.innerHTML = "<p style='grid-column: 1/-1; text-align:center;'>No se encontraron materiales que coincidan.</p>";
            return;
        }
        container.innerHTML = list.map(i => `
            <div class="material-card">
                <h3>${i.name}</h3>
                <p class="desc">${i.description || ''}</p>
                
                <div class="tags-container">
                    ${i.tags ? i.tags.map(t=>`<span class="tag">${t}</span>`).join('') : ''}
                </div>
                
                <p class="${i.available > 0 ? 'available-in-stock':'available-out-stock'}">
                    Disponibles: <strong>${i.available}</strong> / ${i.total}
                </p>
                
                ${i.available > 0 ? 
                    `<button onclick="addToCart('${i.id}')">Agregar a Solicitud</button>` : 
                    '<button disabled style="background:#ccc; cursor:not-allowed;">Agotado</button>'}
            </div>`).join('');
    };

    // Render inicial
    drawList(items);

    // Lógica de Buscador en tiempo real
    document.getElementById('search').addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        const filtered = items.filter(i => 
            i.name.toLowerCase().includes(q) || 
            (i.tags && i.tags.some(t => t.toLowerCase().includes(q)))
        );
        drawList(filtered);
    });
    
    updateCartUI();
};

const updateCartUI = () => {
    const links = document.querySelectorAll('nav a');
    // Actualizar texto del botón del menú si estamos en modo alumno
    if(links.length > 1 && currentUserRole === 'student') {
        links[1].innerText = `Solicitud (${getCart().length})`;
    }
};

// --- VISTA DE FORMULARIO DETALLADO (PAPEL DIGITAL) ---
const renderRequestForm = () => {
    const cart = getCart();
    
    if(cart.length === 0) {
        mainContent.innerHTML = `
            <div style="text-align:center; margin-top:50px;">
                <h2>Tu solicitud está vacía</h2>
                <p>Regresa al inventario para seleccionar materiales.</p>
                <button class="btn-primary" onclick="navigateTo('student_consult')" style="width:auto;">Ir al Inventario</button>
            </div>
        `;
        return;
    }
    
    // Pre-llenar fecha con hoy
    const today = new Date().toISOString().split('T')[0];

    mainContent.innerHTML = `
        <h2>Completar Solicitud de Préstamo</h2>
        
        <div class="request-container">
            <!-- COLUMNA 1: LISTA DE MATERIALES -->
            <div class="cart-section">
                <h3>1. Materiales Seleccionados</h3>
                <ul style="list-style:none; padding:0;">
                    ${cart.map(i => `
                        <li style="border-bottom:1px solid #eee; padding:10px 0; display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <strong>${i.name}</strong><br>
                                <small>Cantidad: ${i.quantity}</small>
                            </div>
                            <button class="btn-remove" onclick="removeFromCart('${i.id}')">🗑️</button>
                        </li>
                    `).join('')}
                </ul>
                <button class="btn-secondary" onclick="navigateTo('student_consult')">+ Agregar más material</button>
            </div>

            <!-- COLUMNA 2: FORMULARIO ADMINISTRATIVO -->
            <div class="form-section">
                <h3>2. Datos del Préstamo</h3>
                <form id="loan-form">
                    <label>Nombre Completo:</label>
                    <input type="text" id="s-name" placeholder="Nombre del Alumno" required>

                    <label>Número de Expediente / Matrícula:</label>
                    <input type="text" id="s-id" value="${currentStudentId}" required readonly style="background:#f0f0f0; cursor:not-allowed;">

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

                    <label>Profesor a Cargo:</label>
                    <input type="text" id="s-prof" placeholder="Nombre del Docente Responsable" required>

                    <button type="submit" class="btn-primary" style="margin-top:20px;">Confirmar y Generar Solicitud</button>
                </form>
            </div>
        </div>
        
        <!-- ÁREA DE RESULTADO (OCULTA AL INICIO) -->
        <div id="result-area" style="display:none; text-align:center; margin-top:30px; background:white; padding:30px; border-radius:8px; box-shadow:0 4px 15px rgba(0,0,0,0.2);">
            <!-- Se inyecta dinámicamente tras el submit -->
        </div>
    `;

    // MANEJO DEL ENVÍO DEL FORMULARIO
    document.getElementById('loan-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Recopilar datos completos
        const requestData = {
            studentName: document.getElementById('s-name').value,
            studentId: currentStudentId,
            date: document.getElementById('s-date').value,
            time: document.getElementById('s-time').value,
            aula: document.getElementById('s-aula').value,
            professor: document.getElementById('s-prof').value,
            items: cart, // Array con los materiales
            timestamp: Date.now()
        };

        // UI de carga
        const resultArea = document.getElementById('result-area');
        document.querySelector('.request-container').style.display = 'none';
        resultArea.style.display = 'block';
        resultArea.innerHTML = `<div style="padding:20px;"><h3>Procesando solicitud...</h3></div>`;

        // LÓGICA HÍBRIDA (Intentar Nube -> Fallback Token)
        let generatedCode = null;
        let isOnline = false;

        if (navigator.onLine && window.db && window.firebase) {
            try {
                // Generar un código corto legible (Ej: P-4821)
                const shortCode = "P-" + Math.floor(1000 + Math.random() * 9000);
                const { collection, addDoc } = window.firebase;
                
                // Guardar en colección temporal 'requests' en la nube
                await addDoc(collection(window.db, "requests"), {
                    ...requestData,
                    code: shortCode,
                    status: 'pending'
                });

                generatedCode = shortCode;
                isOnline = true;

            } catch (err) { 
                console.warn("Fallo subida online, usando Token local.", err); 
                isOnline = false;
            }
        }

        // RENDERIZAR RESULTADO
        if (isOnline) {
            // Opción A: Éxito Online (Código Corto)
            resultArea.innerHTML = `
                <h2 style="color:#009688;">✅ Solicitud Enviada</h2>
                <p>Entrega este código de verificación al encargado del almacén:</p>
                
                <div class="big-code">${generatedCode}</div>
                
                <p style="font-size:0.9em; color:#666;">Tu solicitud con ${cart.length} materiales ha sido guardada en la nube.</p>
                <button onclick="finishStudentProcess()" class="btn-secondary">Finalizar y Salir</button>
            `;
        } else {
            // Opción B: Fallback Offline (Token JSON) - Sin QR, solo texto como pediste
            const jsonStr = JSON.stringify(requestData);
            resultArea.innerHTML = `
                <h2 style="color:#E65100;">⚠️ Modo Sin Conexión</h2>
                <p>No se pudo conectar al servidor. Copia este token para el encargado:</p>
                
                <textarea style="width:100%; height:100px; font-family:monospace; font-size:0.8em;" readonly>${jsonStr}</textarea>
                
                <button onclick="copyData('${btoa(jsonStr)}')" class="btn-primary" style="margin-bottom:10px;">Copiar Token</button>
                <button onclick="finishStudentProcess()" class="btn-secondary">Finalizar</button>
            `;
        }
    });
};

// Función auxiliar para copiar el token al portapapeles
window.copyData = (encoded) => {
    const text = atob(encoded);
    navigator.clipboard.writeText(text).then(() => alert("Token copiado al portapapeles."));
};

window.finishStudentProcess = () => { 
    clearCart(); 
    navigateTo('student_consult'); 
};

// --- VISTA DE HISTORIAL (CONSULTA FIREBASE) ---
const renderStudentHistory = async () => {
    mainContent.innerHTML = `<h2>Historial de Préstamos</h2><p>Consultando registros en la nube para: <strong>${currentStudentId}</strong>...</p>`;
    
    if (!currentStudentId) { 
        mainContent.innerHTML = `<p>No hay matrícula registrada. Por favor, cierra sesión e ingresa tu matrícula.</p>`; 
        return; 
    }

    if (navigator.onLine && window.db && window.firebase) {
        try {
            const { collection, query, where, getDocs } = window.firebase;
            // Buscar préstamos donde el studentId coincida
            const q = query(collection(window.db, "loans"), where("studentId", "==", currentStudentId));
            
            const querySnapshot = await getDocs(q);
            const history = [];
            querySnapshot.forEach((doc) => history.push({ firestoreId: doc.id, ...doc.data() }));
            
            // Ordenar por fecha (más reciente primero)
            history.sort((a, b) => b.timestamp - a.timestamp);

            if (history.length === 0) {
                mainContent.innerHTML = `<h2>Historial</h2><p>No se encontraron préstamos registrados en el sistema.</p>`;
                return;
            }

            mainContent.innerHTML = `
                <h2>Historial de Préstamos</h2>
                <div class="history-list">
                    ${history.map(loan => `
                        <div class="material-card history-card">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                                <strong>📅 ${new Date(loan.timestamp).toLocaleDateString()}</strong>
                                <span class="tag" style="background:#E8F5E9; color:2E7D32; border-color:#2E7D32;">${loan.status === 'active' ? 'En Curso' : 'Devuelto'}</span>
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
            mainContent.innerHTML = `<p>Error de conexión. El historial requiere internet para consultar la base de datos.</p>`; 
        }
    } else { 
        mainContent.innerHTML = `<p><strong>Modo Offline:</strong> El historial no está disponible sin conexión a internet.</p>`; 
    }
};

// --------------------------------------------------------------------------------
// 7. VISTAS DEL ADMINISTRADOR
// --------------------------------------------------------------------------------

// --- VALIDACIÓN Y ENTREGA DE MATERIAL ---
const renderAdminValidate = () => {
    mainContent.innerHTML = `
        <h2>✅ Validar y Entregar Préstamo</h2>
        
        <div class="admin-form">
            <!-- OPCIÓN A: CÓDIGO CORTO (Recomendado) -->
            <div style="background:#E8F5E9; padding:15px; border-radius:8px; margin-bottom:20px;">
                <h3 style="margin-top:0; color:#2E7D32;">Opción A: Código de Verificación</h3>
                <p style="font-size:0.9em;">Si el alumno tiene internet, te dará un código corto (Ej: P-1234).</p>
                <div style="display:flex; gap:10px;">
                    <input type="text" id="verify-code" placeholder="P-XXXX" style="font-size:1.5em; text-align:center; text-transform:uppercase; font-weight:bold;">
                    <button onclick="searchByCode()" class="btn-primary" style="width:auto;">Buscar</button>
                </div>
            </div>

            <hr style="margin:20px 0; border:0; border-top:2px dashed #ccc;">

            <!-- OPCIÓN B: JSON MANUAL (Respaldo Offline) -->
            <div style="background:#FFF3E0; padding:15px; border-radius:8px;">
                <h3 style="margin-top:0; color:#E65100;">Opción B: Respaldo Offline (JSON)</h3>
                <p style="font-size:0.9em;">Si el alumno NO tiene internet, pega el Token JSON aquí:</p>
                <textarea id="qr-input" rows="3" placeholder='Pegar código JSON aquí...' style="font-family:monospace; font-size:0.8em;"></textarea>
                <button onclick="processJSON()" class="btn-secondary">Procesar Token</button>
            </div>
        </div>

        <!-- Aquí se muestra el resultado de la búsqueda -->
        <div id="loan-result"></div>
    `;
};

// Búsqueda por Código Corto en Firebase
window.searchByCode = async () => {
    const code = document.getElementById('verify-code').value.toUpperCase().trim();
    if(!code) return alert("Por favor escribe un código.");

    if (navigator.onLine && window.db && window.firebase) {
        try {
            const { collection, query, where, getDocs } = window.firebase;
            // Buscamos en la colección 'requests'
            const q = query(collection(window.db, "requests"), where("code", "==", code), where("status", "==", "pending"));
            const snap = await getDocs(q);

            if (!snap.empty) {
                // Encontramos la solicitud
                const docData = snap.docs[0].data();
                // Guardamos el ID del documento para poder borrarlo/actualizarlo después
                const requestDocId = snap.docs[0].id;
                showConfirmation({ ...docData, requestDocId });
            } else {
                alert("Código no encontrado o la solicitud ya fue procesada.");
            }
        } catch (error) { 
            console.error(error);
            alert("Error de conexión al buscar el código."); 
        }
    } else {
        alert("Necesitas internet para validar por código corto. Usa la opción B.");
    }
};

// Lógica: Procesar JSON pegado manualmente
window.processJSON = () => {
    try { 
        const raw = document.getElementById('qr-input').value;
        if(!raw) return alert("El campo está vacío.");
        const data = JSON.parse(raw);
        showConfirmation(data);
    } 
    catch (e) { alert("El texto pegado no es un JSON válido."); }
};

// Vista de Confirmación (Común para ambos métodos)
const showConfirmation = async (data) => {
    const resultDiv = document.getElementById('loan-result');
    
    // HTML Base del resumen
    let html = `
        <div style="background:white; padding:20px; border-radius:8px; margin-top:30px; border:2px solid #1A237E; box-shadow:0 5px 15px rgba(0,0,0,0.2);">
            <h3 style="margin-top:0; color:#1A237E;">Confirmar Entrega de Material</h3>
            
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:0.9em; margin-bottom:15px;">
                <div><strong>Alumno:</strong> ${data.studentName}</div>
                <div><strong>Matrícula:</strong> ${data.studentId}</div>
                <div><strong>Aula:</strong> ${data.aula}</div>
                <div><strong>Profesor:</strong> ${data.professor}</div>
                <div><strong>Horario:</strong> ${data.time}</div>
            </div>
            
            <hr>
            <h4>Materiales Solicitados:</h4>
            <ul style="list-style:none; padding:0;">`;
    
    let canApprove = true;
    
    // Validación de Stock en Tiempo Real
    if (navigator.onLine && window.db && window.firebase) {
        const { doc, getDoc } = window.firebase;
        
        // Iteramos sobre cada item solicitado para verificar stock
        for (let item of data.items) {
            const ref = doc(window.db, "inventory", item.id);
            const snap = await getDoc(ref);
            
            if (snap.exists()) {
                const currentStock = snap.data().available;
                if (currentStock >= item.quantity) {
                    html += `<li style="color:green; padding:5px 0; border-bottom:1px solid #eee;">
                        ✅ <strong>${item.name}</strong>: Solicita ${item.quantity} (Stock actual: ${currentStock})
                    </li>`;
                } else {
                    html += `<li style="color:red; padding:5px 0; border-bottom:1px solid #eee;">
                        ❌ <strong>${item.name}</strong>: Solicita ${item.quantity} (Stock INSUFICIENTE: ${currentStock})
                    </li>`;
                    canApprove = false;
                }
            } else {
                 html += `<li style="color:orange; padding:5px 0;">⚠️ <strong>${item.name}</strong>: No encontrado en BD (Posiblemente ID local antiguo)</li>`;
                 canApprove = false; 
            }
        }
    } else {
        html += "<p style='color:red; font-weight:bold;'>⚠️ Sin conexión a internet. No se puede validar el stock real.</p>";
        canApprove = false;
    }
    
    html += `</ul>`;
    
    if (canApprove) {
        // Guardamos los datos en variable global temporal para pasarlos a la función de confirmación
        window.tempLoanData = data; 
        html += `<button onclick="confirmLoan()" class="btn-primary" style="background:#2E7D32; margin-top:15px; padding:15px; font-size:1.2em;">✅ CONFIRMAR Y ENTREGAR</button>`;
    } else {
        html += `<button disabled style="background:#ccc; color:#666; width:100%; padding:10px; cursor:not-allowed;">⛔ No se puede aprobar (Stock insuficiente o Error)</button>`;
    }
    
    html += `</div>`;
    resultDiv.innerHTML = html;
    resultDiv.scrollIntoView({ behavior: 'smooth' });
};

// Función Final: Ejecutar la transacción en BD
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

            // 2. Guardar Registro Histórico en 'loans'
            await addDoc(collection(window.db, "loans"), {
                ...data, // Guardamos todos los detalles
                timestamp: Date.now(),
                status: 'active'
            });

            // 3. Borrar solicitud temporal si existe (flujo online)
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

// --- ADMIN DASHBOARD (CON GRÁFICA DE BARRAS CSS) ---
const renderAdminDashboard = async () => {
    // Simulamos datos de préstamos por día para la gráfica
    const weeklyData = [
        { day: "Lun", count: 12 },
        { day: "Mar", count: 19 },
        { day: "Mié", count: 8 },
        { day: "Jue", count: 15 },
        { day: "Vie", count: 22 } 
    ];

    // Calcular el máximo para sacar porcentajes de altura
    const maxVal = Math.max(...weeklyData.map(d => d.count));

    // Generar HTML de las barras
    const barsHtml = weeklyData.map(d => {
        const height = (d.count / maxVal) * 100; 
        const colorClass = d.count === maxVal ? 'bar-peak' : ''; 
        
        return `
            <div class="chart-bar-container">
                <div class="chart-bar ${colorClass}" style="height: ${height}%;">
                    <span class="chart-tooltip">${d.count}</span>
                </div>
                <span class="chart-label">${d.day}</span>
            </div>
        `;
    }).join('');

    // Obtener datos reales simples para los KPIs
    const inventory = await getInventory();
    const lowStock = inventory.filter(i => i.available < 2).length;

    mainContent.innerHTML = `
        <h2>Dashboard de Almacén</h2>
        
        <!-- TARJETAS DE KPI -->
        <div class="dashboard-grid">
            <div class="kpi-card">
                <h3>${lowStock}</h3>
                <p>⚠️ Stock Crítico</p>
            </div>
            <div class="kpi-card">
                <h3>76</h3>
                <p>✅ Préstamos Totales</p>
            </div>
            <div class="kpi-card highlight">
                <h3>Viernes</h3>
                <p>📅 Día más activo</p>
            </div>
        </div>

        <!-- GRÁFICA DE BARRAS -->
        <div class="chart-section">
            <h3>Actividad Semanal (Préstamos)</h3>
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

// --- ADMIN GESTIÓN DE INVENTARIO (ALTA) ---
const renderAdminInventory = async () => {
    mainContent.innerHTML = `
        <h2>Gestión de Inventario</h2>
        
        <form id="add-form" class="admin-form">
            <h3>Alta de Material</h3>
            <label>Nombre:</label><input type="text" id="m-name" required>
            <label>Descripción:</label><input type="text" id="m-desc" required>
            
            <div class="form-row">
                <div><label>Stock:</label><input type="number" id="m-total" min="1" required></div>
            </div>
            
            <label>Etiquetas (Separadas por comas):</label>
            <input type="text" id="m-tags" placeholder="Ej: Lab Electrónica, Mecatrónica, Cables">
            
            <button type="submit" class="btn-primary">Guardar Material</button>
        </form>
        
        <h3>Inventario Actual</h3>
        <div id="adm-list" class="inventory-list"></div>
    `;
    
    const items = await getInventory();
    document.getElementById('adm-list').innerHTML = items.map(i => `
        <div class="material-card">
            <h3>${i.name}</h3>
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
                 alert("Material guardado en la Nube.");
                 await renderAdminInventory(); 
             } catch(err) {
                 alert("Error al guardar en Firebase.");
             }
        } else {
            alert("No se puede añadir material en modo Offline.");
        }
    });
};

// --------------------------------------------------------------------------------
// 8. SERVICE WORKER REGISTRO
// --------------------------------------------------------------------------------
if('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}