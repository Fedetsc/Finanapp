# Cuentas del hogar (Expo + React Native)

## Correr
    npm install
    npx expo install --fix   # alinea versiones con tu SDK de Expo
    npx expo start           # escaneá el QR con Expo Go

## Qué incluye
Ingresos de pareja, gastos con división (50/50, proporcional, solo uno), tarjetas con cierre y cuotas,
USD con cotización, gastos fijos, topes por categoría, metas, rendimientos y bandeja obligatoria de
movimientos sin categoría. Datos en AsyncStorage (solo en el dispositivo).

## Para conectar bancos en tiempo real (siguiente etapa)
La app móvil nunca debe guardar credenciales bancarias. Hace falta un backend:
1. Backend (Node/Supabase) con OAuth de Mercado Pago y un webhook que reciba los pagos.
2. Para Santander: verificar si hay API disponible; si no, importar CSV o leer mails de aviso de consumo.
3. El backend guarda el movimiento y envía push con `expo-notifications`.
4. Al recibir la push o al abrir la app, llamar `A.ingest({src,desc,amt,date})` (en src/store.js):
   la bandeja obligatoria ya funciona igual que en la demo.
5. Reemplazar AsyncStorage por una base compartida (Supabase) para sincronizar a la pareja.
