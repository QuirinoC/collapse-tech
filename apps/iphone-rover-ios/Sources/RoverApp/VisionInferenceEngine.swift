import CoreML
import Foundation
import Vision

struct RoverVisionObservation: Equatable {
    let label: String
    let confidence: Float
    let centerX: CGFloat
    let area: CGFloat
}

final class VisionInferenceEngine {
    enum EngineStatus: Equatable {
        case coreMLModelLoaded
        case rectangleFallback
        case unavailable(String)
    }

    private(set) var status: EngineStatus = .rectangleFallback
    private var coreMLRequest: VNCoreMLRequest?

    init() {
        guard let modelURL = Bundle.main.url(
            forResource: "RoverDetector",
            withExtension: "mlmodelc"
        ) else {
            return
        }

        do {
            let model = try VNCoreMLModel(for: MLModel(contentsOf: modelURL))
            let request = VNCoreMLRequest(model: model)
            request.imageCropAndScaleOption = .scaleFill
            coreMLRequest = request
            status = .coreMLModelLoaded
        } catch {
            status = .unavailable("Core ML model could not load: \(error.localizedDescription)")
        }
    }

    func analyze(_ pixelBuffer: CVPixelBuffer) -> RoverVisionObservation? {
        let request: VNRequest
        if let coreMLRequest {
            request = coreMLRequest
        } else {
            let rectangleRequest = VNDetectRectanglesRequest()
            rectangleRequest.minimumConfidence = 0.65
            rectangleRequest.maximumObservations = 1
            request = rectangleRequest
        }

        do {
            let handler = VNImageRequestHandler(
                cvPixelBuffer: pixelBuffer,
                orientation: .right,
                options: [:]
            )
            try handler.perform([request])
        } catch {
            return nil
        }

        if let observations = request.results as? [VNRecognizedObjectObservation],
           let observation = observations.first,
           let label = observation.labels.first {
            return RoverVisionObservation(
                label: label.identifier,
                confidence: label.confidence,
                centerX: observation.boundingBox.midX,
                area: observation.boundingBox.width * observation.boundingBox.height
            )
        }

        if let rectangles = request.results as? [VNRectangleObservation],
           let rectangle = rectangles.first {
            return RoverVisionObservation(
                label: "rectangle",
                confidence: rectangle.confidence,
                centerX: rectangle.boundingBox.midX,
                area: rectangle.boundingBox.width * rectangle.boundingBox.height
            )
        }

        return nil
    }
}
