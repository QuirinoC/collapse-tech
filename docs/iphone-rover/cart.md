# iPhone Rover v0 purchase list

The active prototype cart is on Adafruit: [open shopping cart](https://www.adafruit.com/shopping_cart). It currently has a subtotal of **$89.50 before tax and shipping**.

This is intentionally a 1S bring-up build. It is safer and cheaper for proving camera-guided cone driving, but it does not include wheel encoders. Upgrade the motors and power stage after the first moving demo.

## In the Adafruit cart

- [ESP32-C3 DevKitM-01, product 5337](https://www.adafruit.com/product/5337) — 1 × $9.95
- [DRV8833 dual motor driver, product 3297](https://www.adafruit.com/product/3297) — 1 × $5.95
- [PowerBoost 1000 Charger, product 2465](https://www.adafruit.com/product/2465) — 1 × $19.95
- [Protected 3.7 V 2500 mAh LiPo, product 328](https://www.adafruit.com/product/328) — 1 × $14.95
- [TT 3–6 V geared motors, product 3777](https://www.adafruit.com/product/3777) — 2 × $2.95
- [VL53L0X short-range ToF sensor, product 3317](https://www.adafruit.com/product/3317) — 1 × $14.95
- [STEMMA QT to male-header cable, product 4209](https://www.adafruit.com/product/4209) — 1 × $0.95
- [Aluminum rover chassis, product 2943](https://www.adafruit.com/product/2943) — 1 × $9.95
- [TT motor wheels, product 3757](https://www.adafruit.com/product/3757) — 2 × $2.50
- [20 mm metal caster, product 3948](https://www.adafruit.com/product/3948) — 1 × $1.95

The cart is a browser session, so the items may not appear if the cart is opened in a different browser or after its session expires. Do not proceed to checkout without confirming stock, shipping, and tax.

## Buy locally near 98008

[Vetco Electronics](https://vetco.net/pages/contact) is at **12718 Northup Way, Suite 100, Bellevue, WA 98005**, phone **(425) 641-7275**. Call first for stock. Ask for:

- Solderless breadboard or perfboard
- Male header strips for the DRV8833 and ESP32
- Dupont jumper wires and 22–26 AWG stranded wire
- Two normally-closed bumper microswitches
- Master power switch and inline fuse holder
- A small assortment of 1–3 A fuses
- Two equal resistors for a 2:1 battery-voltage divider, such as 100 kOhm each
- 0.1 uF capacitor and a 470–1000 uF electrolytic capacitor
- Heat-shrink tubing, solder, and M3 screws/standoffs
- A micro-USB cable for programming the ESP32-C3

The equal-resistor divider is required before using the firmware’s battery ADC reading. The fuse size must be selected after measuring motor startup and stall current.

## Encoder upgrade

The cart motors are deliberately inexpensive and have no feedback. For accurate teach-and-repeat routes, replace them later with two [Pololu 6 V micro metal gearmotors with integrated quadrature encoders](https://www.pololu.com/product/5166). They are much more expensive and may require motor brackets/adapters, so they are not part of the first camera-only moving demo.

## Important power note

The battery powers the motors directly through the DRV8833. The PowerBoost supplies regulated 5 V to the ESP32. Keep motor and logic power paths separate, start with very low PWM, and stop immediately if the battery protection circuit trips, a driver overheats, or wiring becomes warm.
