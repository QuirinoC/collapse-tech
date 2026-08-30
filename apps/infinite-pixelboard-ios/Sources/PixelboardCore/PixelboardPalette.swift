import Foundation

public enum PixelboardPalette {
    public static let freeColors = [
        "#171714",
        "#D3523C",
        "#DC9B32",
        "#E1C94A",
        "#587554",
        "#356B76",
        "#425B8C",
        "#7E5078",
        "#F7F3EA"
    ]

    public static let proColors = [
        "#171714",
        "#000000",
        "#5B4636",
        "#B94E48",
        "#D3523C",
        "#F08A6A",
        "#DC9B32",
        "#F4A261",
        "#E1C94A",
        "#F2C14E",
        "#587554",
        "#9AA66F",
        "#356B76",
        "#2F8F83",
        "#425B8C",
        "#6D7FB3",
        "#7E5078",
        "#A45A9C",
        "#C7A6D8",
        "#D8B4A0",
        "#9B9B93",
        "#E5E5D8",
        "#F7F3EA",
        "#FFFFFF"
    ]

    public static func name(for color: String) -> String {
        switch color.uppercased() {
        case "#171714": return "Near-black"
        case "#D3523C": return "Red"
        case "#DC9B32": return "Orange"
        case "#E1C94A": return "Yellow"
        case "#587554": return "Green"
        case "#356B76": return "Cyan"
        case "#425B8C": return "Blue"
        case "#7E5078": return "Violet"
        case "#F7F3EA": return "Off-white"
        case "#5B4636": return "Brown"
        case "#B94E48": return "Rose"
        case "#F08A6A": return "Coral"
        case "#F2C14E": return "Gold"
        case "#9AA66F": return "Olive"
        case "#2F8F83": return "Teal"
        case "#6D7FB3": return "Periwinkle"
        case "#A45A9C": return "Magenta"
        case "#C7A6D8": return "Lilac"
        case "#D8B4A0": return "Blush"
        case "#E5E5D8": return "Ivory"
        case "#9B9B93": return "Gray"
        case "#FFFFFF": return "White"
        case "#000000": return "Black"
        case "#F4A261": return "Apricot"
        default: return color
        }
    }
}
