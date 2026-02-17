# color-ramp-generator
A11y Color Ramp Generator - Plugin for Figma Design.

## Uso

### 1) Preparar tu componente
- Crea/usa una instancia (o frame) que contenga tus **slots** como **children directos**.
- Cada slot debería contener:
  - Un nodo con **fill SOLID** (normalmente un `Rectangle`) que represente el color.
  - (Opcional) Textos con estos nombres (el plugin los detecta por nombre, sin importar mayúsculas/espacios):
    - `hex`
    - `oklch`
    - `contrast white` / `contrast on white` / `contrast blanco`
    - `contrast black` / `contrast on black` / `contrast negro`
    - `step` (o similar)
    - `name` / `nombre`

Si tus capas tienen otros nombres, ejecuta **Diagnosticar selección** y pégame la salida para ajustar el mapeo.

### 2) Ejecutar el plugin
1. Selecciona en el lienzo la instancia/frame de la rampa.
2. Ejecuta el plugin.
3. Pulsa **Diagnosticar selección** para ver el árbol.
4. Rellena el **HEX base**, pasos (máx 14), rango de L, etc. y pulsa **Generar rampa**.
