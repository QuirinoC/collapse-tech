# iPhone Rover market validation

## Product hypothesis

An iPhone can supply the camera, inertial sensing, on-device machine learning, and optional depth sensing for a small indoor rover. The hardware can therefore focus on motion, power, and a safe communication bridge instead of shipping a Raspberry Pi or Jetson.

The initial buyer is more likely to be a maker, iOS developer, or STEM learner than a parent buying a standalone children's toy. The buyer must already own an iPhone they are willing to mount, or have an older spare device.

## Competitive signal

| Product | Observed price | What it validates | Gap to exploit |
| --- | ---: | --- | --- |
| Sphero RVR+ | About $339 | People pay for a polished programmable rover and curriculum | Expensive for a first robotics project; the phone is not the primary brain |
| Hiwonder TurboPi | About $100 | A low-cost AI rover can attract beginner makers | Requires Raspberry Pi hardware and has a more technical setup |
| Hiwonder MentorPi / JetAuto | Roughly $300–$750+ | Advanced users pay for LiDAR, ROS2, and depth cameras | Overbuilt for a simple indoor phone-controlled learning experience |

These are directional retail observations, not a total-addressable-market estimate. The opportunity is a wedge: a low-BOM, iOS-native robotics platform that makes computer vision tangible. It is not yet evidence that a mass-market toy business exists.

## Landing-page test

### Headline

**Turn an iPhone into a tiny autonomous rover.**

### Supporting copy

Mount an iPhone on a compact two-wheel robot. Drive it manually, teach it to follow a target, and run private on-device vision without a cloud account. LiDAR is an optional upgrade; the base experience works with the phone camera.

### Call to action

**Join the prototype test**

Collect:

- iPhone model and whether it has LiDAR
- Whether the respondent owns a spare iPhone they would mount
- Preferred form: assembled rover, electronics kit, or open-source plans
- Acceptable price excluding the iPhone
- Desired first feature: remote drive, line following, target following, or obstacle avoidance

## Interview script

Ask 10–15 people across makers, iOS developers, educators, and parents:

1. What would you want a small autonomous rover to do in the first five minutes?
2. Would you mount your primary phone, a spare phone, or neither?
3. Would a camera-only version be useful, or is LiDAR essential?
4. Which is more valuable: a polished app, a programmable SDK, or a classroom curriculum?
5. Would you rather assemble electronics or buy a tested rover?
6. What price feels reasonable for hardware that excludes the phone?
7. What would make you stop using it after the first weekend?

Record commitments, not compliments: email signups, preorders, requests for a test unit, and willingness to provide a spare phone are stronger signals than general enthusiasm.

## Go/no-go signals

Proceed to a refined prototype if at least one of these is true:

- 30% or more of interviewees agree to test with an existing/spare iPhone and provide contact details.
- At least five people request an assembled or kit version at a price that leaves room for support and compliance costs.
- Developers ask for the BLE protocol or SDK even when they do not want a finished toy.

Reposition or stop if most respondents will not risk mounting a phone, require standalone hardware, or compare the product only to inexpensive remote-control cars.

## Research sources

- [Apple Core ML](https://developer.apple.com/machine-learning/core-ml/)
- [Apple ARWorldTrackingConfiguration](https://developer.apple.com/documentation/arkit/arworldtrackingconfiguration)
- [Apple ARDepthData](https://developer.apple.com/documentation/arkit/ardepthdata)
- [Sphero RVR+](https://sphero.com/products/rvr)
- [Hiwonder TurboPi](https://www.hiwonder.com/products/turbopi)
- [Hiwonder MentorPi A1](https://www.hiwonder.com/products/mentorpi-a1)
- [Adafruit 2WD chassis reference](https://www.adafruit.com/product/3216)

Prices and availability should be rechecked before any purchasing decision.
