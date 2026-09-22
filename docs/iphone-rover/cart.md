# iPhone Rover v0 purchase list

The active prototype cart is on Adafruit: [open shopping cart](https://www.adafruit.com/shopping_cart). It currently has a subtotal of **$92.45 before tax and shipping**.

This is intentionally a 1S bring-up build. It is safer and cheaper for proving camera-guided cone driving, but it does not include wheel encoders. Upgrade the motors and power stage after the first moving demo.

## In the Adafruit cart

- [ESP32-S3-DevKitC-1, 32MB flash, product 5364](https://www.adafruit.com/product/5364) — 1 × $19.95
- [DRV8833 dual motor driver, product 3297](https://www.adafruit.com/product/3297) — 1 × $5.95
- [PowerBoost 1000 Charger, product 2465](https://www.adafruit.com/product/2465) — 1 × $19.95
- [Protected 3.7 V 2500 mAh LiPo, product 328](https://www.adafruit.com/product/328) — 1 × $14.95
- [TT 3–6 V geared motors, product 3777](https://www.adafruit.com/product/3777) — 2 × $2.95
- [Octagon TT-motor chassis, product 4466](https://www.adafruit.com/product/4466) — 1 × $9.95
- [TT motor wheels, product 3757](https://www.adafruit.com/product/3757) — 2 × $2.50
- [20 mm metal caster, product 3948](https://www.adafruit.com/product/3948) — 1 × $1.95
- [100 kΩ resistors, 25 pack, product 2787](https://www.adafruit.com/product/2787) — 1 × $0.95
- [Full-size breadboard, product 239](https://www.adafruit.com/product/239) — 1 × $5.95
- [Male/male jumper wires, product 1957](https://www.adafruit.com/product/1957) — 1 × $1.95

The VL53L0X, its cable, and the extra header pack were removed. The iPhone is the camera, the firmware does not read that sensor, and the DRV8833 already includes the header strip that has to be soldered on. Adafruit does not stock a switch or fuse rated for these motors' stall current, so those stay off this order.

The ESP32-C3 DevKit (5337), aluminum mini chassis (2943), half-size breadboard (64), and jumper-wire bundle (153) were out of stock on September 19, 2026. The cart uses the in-stock ESP32-S3 DevKit, octagon TT chassis, full-size breadboard, and 20-pack of jumper wires instead. Do not add the optional extra motor on the chassis page; the two TT motors are already separate lines.

The cart is a browser session, so the items may not appear if the cart is opened in a different browser or after its session expires. Do not proceed to checkout without confirming stock, shipping, and tax.

## Buy locally near 98008

[Vetco Electronics](https://vetco.net/pages/contact) is at **12718 Northup Way, Suite 100, Bellevue, WA 98005**, phone **(425) 641-7275**. Call first for stock. Ask for:

- Two normally-closed bumper microswitches
- A master switch and an inline fuse holder rated for at least 3 A
- A small assortment of 2–3 A fuses
- 0.1 uF capacitor and a 470–1000 uF electrolytic capacitor
- Heat-shrink tubing and solder
- A USB-C cable for programming the ESP32-S3 DevKit
- Four M3 or 4-40 screws, about 24 mm, to mount the two TT motors in the octagon chassis
- A clamp or printed mount for the iPhone

The equal-resistor divider is required before using the firmware’s battery ADC reading. The fuse size must be selected after measuring motor startup and stall current.

## Encoder upgrade

The cart motors are deliberately inexpensive and have no feedback. For accurate teach-and-repeat routes, replace them later with two [Pololu 6 V micro metal gearmotors with integrated quadrature encoders](https://www.pololu.com/product/5166). They are much more expensive and may require motor brackets/adapters, so they are not part of the first camera-only moving demo.

## Important power note

The battery powers the motors directly through the DRV8833. The PowerBoost supplies regulated 5 V to the ESP32. Keep motor and logic power paths separate, start with very low PWM, and stop immediately if the battery protection circuit trips, a driver overheats, or wiring becomes warm.
