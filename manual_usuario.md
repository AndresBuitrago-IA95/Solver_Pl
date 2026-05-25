# 📘 Manual de Usuario — Solver PL (Universidad de Antioquia)

Bienvenido al **Software de Programación Lineal (Solver PL)**. Esta herramienta ha sido diseñada para estudiantes, profesores e investigadores de la Universidad de Antioquia, permitiendo resolver problemas de optimización lineal de forma didáctica y paso a paso.

El diseño de la aplicación ha sido adaptado utilizando la paleta institucional (Verde Principal `#026937` y colores complementarios).

---

## 🎯 ¿Qué puede hacer el software?
El software resuelve problemas de maximización y minimización sujetos a restricciones matemáticas, utilizando:
1. **Método Simplex Estándar**: Para restricciones de tipo menor o igual (`≤`).
2. **Método de la Gran M (Big-M)**: Para problemas que incluyen restricciones de tipo mayor o igual (`≥`) o igualdades estrictas (`=`).
3. **Método Gráfico**: Una representación visual bidimensional, habilitada automáticamente cuando el problema tiene exactamente **2 variables de decisión**.
4. **Análisis de Sensibilidad**: Un reporte profundo post-optimal que evalúa los rangos permisibles y el impacto de los cambios.

---

## 📝 1. Ingreso de Datos (Pestaña Entrada)

### Configuración Inicial
- **Objetivo**: Selecciona si tu problema trata de *Maximizar* (ej. ganancias) o *Minimizar* (ej. costos).
- **Variables y Restricciones**: Define la cantidad de variables de decisión y el número de restricciones (sin contar las de no-negatividad, que se asumen automáticamente).

### Ingresando la Función Objetivo
En la fila de "Función Objetivo (Z)", ingresa los coeficientes que acompañan a cada variable. Ejemplo: si Z = 3X₁ + 5X₂, ingresa `3` en la primera caja y `5` en la segunda.

### Ingresando las Restricciones
Para cada restricción:
1. Ingresa los coeficientes de las variables en el lado izquierdo.
2. Selecciona el símbolo de la inecuación (`≤`, `≥`, o `=`).
3. Ingresa el valor del recurso (Lado Derecho o RHS).

> [!TIP]
> **Ejemplos Rápidos**: En la parte inferior, puedes hacer clic en cualquiera de los botones de "Ejemplos Rápidos" (como *Producción* o *Big-M*) para cargar automáticamente un problema clásico pre-configurado y explorar cómo funciona la herramienta.

---

## 📊 2. Exploración de la Solución (Pestaña Solución)

Al hacer clic en el botón **"Resolver Problema"**, el motor matemático (SimplexSolver) procesa los datos y te presenta:

- **Formulación**: El problema matemático modelado formalmente.
- **Forma Aumentada**: Cómo se introdujeron las variables de holgura ($S$), exceso ($-S$) y artificiales ($A$) para equilibrar las ecuaciones.
- **Tableros Paso a Paso**: Podrás ver iteración por iteración. 
  - La fila superior muestra los **costos reducidos** de las variables.
  - El pivote (la intersección entre la variable que *entra* y la que *sale*) se resalta automáticamente en amarillo 🌟.
  - Si el modelo detecta que múltiples restricciones cruzan el mismo punto (RHS de variable básica = 0), indicará la presencia de **Degeneración**.
- **Solución Final**: Un resumen del valor óptimo de Z y los valores que debe tomar cada variable de decisión.

---

## 📈 3. Visualización (Pestaña Gráfico)

> [!NOTE]
> Esta pestaña se abrirá automáticamente **solo si el problema tiene 2 variables de decisión**. Si tiene 3 o más, el método gráfico no se aplicará debido a las dimensiones del espacio.

- **Región Factible**: El polígono (área sombreada en verde claro institucional) muestra todas las posibles combinaciones de $X_1$ y $X_2$ que cumplen con todas las restricciones a la vez.
- **Líneas de Restricción**: Dibujadas con los colores complementarios oficiales (Naranja, Azul, Púrpura).
- **Punto Óptimo**: Destacado con una estrella (★) verde lima y sus coordenadas exactas. También se dibuja la recta de nivel (isocuanta) de Z pasando justo por ese vértice.

---

## 🔍 4. Toma de Decisiones (Pestaña Sensibilidad)

El análisis de sensibilidad te indica **qué tanto pueden cambiar las condiciones del problema antes de que tu decisión cambie**. 

### Variables de Decisión
- **Costo Reducido**: Si una variable resultó ser `0` (no se produce), el costo reducido te indica cuánto tiene que mejorar su rentabilidad o costo unitario para que empiece a ser rentable producirla.
- **Rango [Mín, Máx]**: Indica el límite exacto entre los cuales el coeficiente de la función objetivo puede fluctuar sin que las variables óptimas cambien.

### Restricciones (Recursos)
- **Holgura / Exceso**: Cuántas unidades de un recurso sobraron. Si sobró, se dice que la restricción es *no activa* o no vinculante.
- **Precio Sombra (Shadow Price)**: Es el valor marginal. Te indica cuánto mejoraría tu ganancia total (Z) si pudieras conseguir **una unidad adicional** de ese recurso en específico.
- **Rango [Mín, Máx]**: El Precio Sombra es válido únicamente mientras la cantidad de tu recurso se mantenga dentro de estos límites. Si te pasas, el recurso dejará de ser el "cuello de botella" y el valor marginal cambiará.

---

### 🛡️ Notas Técnicas
* El sistema utiliza aritmética de fracciones de precisión infinita interna (no pierde decimales por errores de punto flotante).
* Implementa la *Regla de Bland* para evitar el ciclaje infinito en problemas altamente degenerados.
* El valor de penalización para el método de la Gran M es de $M = 100,000$.
