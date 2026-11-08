import Foundation

public enum ReviewError: LocalizedError {
    case invalid(String)
    public var errorDescription: String? { switch self { case .invalid(let message): message } }
}

public struct Client: Codable, Identifiable, Equatable, Sendable {
    public var client: String
    public var fee: Double
    public var hours: Double
    public var rate: Double
    public var other: Double
    public var id: String { client }
    public init(client: String, fee: Double, hours: Double, rate: Double, other: Double) {
        self.client = client; self.fee = fee; self.hours = hours; self.rate = rate; self.other = other
    }
    public func calculate(target: Int) throws -> Calculation {
        guard (0...99).contains(target), [fee, hours, rate, other].allSatisfy({ $0.isFinite && $0 >= 0 && $0 <= 1e9 }) else {
            throw ReviewError.invalid("Use non-negative amounts up to one billion and a target from 0–99%.")
        }
        let cost = hours * rate + other
        let targetFee = cost / (1 - Double(target) / 100)
        return Calculation(cost: cost, profit: fee - cost, margin: fee > 0 ? (fee - cost) / fee * 100 : nil,
            targetFee: targetFee, gap: max(0, targetFee - fee),
            hourBudget: rate > 0 && other <= fee * (1 - Double(target) / 100) ? (fee * (1 - Double(target) / 100) - other) / rate : nil)
    }
}

public struct Calculation: Equatable, Sendable {
    public let cost: Double
    public let profit: Double
    public let margin: Double?
    public let targetFee: Double
    public let gap: Double
    public let hourBudget: Double?
}

public struct Review: Codable, Identifiable, Equatable, Sendable {
    public var month: String
    public var currency: String
    public var target: Int
    public var rows: [Client]
    public var updatedAt: String?
    public var revision: String?
    public var deletedAt: String?
    public var localEdited: Bool?
    public var id: String { "\(month)|\(currency)" }
    public static let currencies = ["USD", "GBP", "EUR", "CAD", "AUD"]
    public init(month: String, currency: String, target: Int, rows: [Client], updatedAt: String? = nil,
                revision: String? = nil, deletedAt: String? = nil, localEdited: Bool? = nil) {
        self.month = month; self.currency = currency; self.target = target; self.rows = rows
        self.updatedAt = updatedAt; self.revision = revision; self.deletedAt = deletedAt; self.localEdited = localEdited
    }
    public func validated() throws -> Review {
        guard month.range(of: #"^\d{4}-(0[1-9]|1[0-2])$"#, options: .regularExpression) != nil,
              Self.currencies.contains(currency), (0...99).contains(target), (1...500).contains(rows.count) else {
            throw ReviewError.invalid("Use a month in YYYY-MM format, a supported currency, a target from 0–99%, and 1–500 clients.")
        }
        var result = self
        var names = Set<String>()
        result.rows = try rows.map { row in
            var clean = row
            clean.client = row.client.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !clean.client.isEmpty, row.client.utf16.count <= 100,
                  names.insert(clean.client.lowercased()).inserted else {
                throw ReviewError.invalid("Use distinct client names of 1–100 characters.")
            }
            _ = try clean.calculate(target: target)
            return clean
        }
        return result
    }
    public func totals() throws -> Totals {
        var fee = 0.0, profit = 0.0, hours = 0.0
        for row in rows { let result = try row.calculate(target: target); fee += row.fee; profit += result.profit; hours += row.hours }
        return Totals(fee: fee, profit: profit, hours: hours, margin: fee > 0 ? profit / fee * 100 : nil)
    }
}

public struct Totals: Equatable, Sendable {
    public let fee: Double
    public let profit: Double
    public let hours: Double
    public let margin: Double?
}

public struct AccountArchive: Codable, Equatable, Sendable {
    public var format = "retainerlens-account-v1"
    public var exportedAt: String
    public var reviews: [Review]
    public var trash: [Review]
    public init(reviews: [Review] = [], trash: [Review] = []) {
        self.exportedAt = ISO8601DateFormatter().string(from: Date()); self.reviews = reviews; self.trash = trash
    }
    public func validated() throws -> AccountArchive {
        guard format == "retainerlens-account-v1", reviews.count + trash.count <= 1200 else {
            throw ReviewError.invalid("Open a RetainerLens account export containing up to 1,200 reviews.")
        }
        var copy = self, keys = Set<String>()
        copy.reviews = try reviews.map { try $0.validated() }
        copy.trash = try trash.map { try $0.validated() }
        for review in copy.reviews + copy.trash {
            guard keys.insert(review.id).inserted else { throw ReviewError.invalid("This file contains duplicate months in the same currency.") }
        }
        guard copy.reviews.allSatisfy({ $0.deletedAt == nil }), copy.trash.allSatisfy({ $0.deletedAt != nil }) else {
            throw ReviewError.invalid("This file has inconsistent Trash records.")
        }
        return copy
    }
    public static func decode(_ data: Data) throws -> AccountArchive {
        guard data.count <= 25_000_000 else { throw ReviewError.invalid("Open a document smaller than 25 MB.") }
        return try JSONDecoder().decode(Self.self, from: data).validated()
    }
    public func encoded() throws -> Data {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(validated())
    }
    public mutating func replace(_ review: Review, originalID: String? = nil) throws {
        var copy = self
        var next = try review.validated(); next.localEdited = true
        if let originalID, let index = copy.reviews.firstIndex(where: { $0.id == originalID }) { copy.reviews[index] = next }
        else if originalID != nil { throw ReviewError.invalid("This review is no longer available.") }
        else { copy.reviews.append(next) }
        self = try copy.validated()
    }
    public mutating func moveToTrash(id: String) throws {
        guard let index = reviews.firstIndex(where: { $0.id == id }) else { throw ReviewError.invalid("Choose a review first.") }
        var copy = self
        var review = copy.reviews.remove(at: index)
        review.deletedAt = ISO8601DateFormatter().string(from: Date()); review.localEdited = true
        copy.trash.append(review); self = try copy.validated()
    }
    public mutating func restore(id: String) throws {
        guard let index = trash.firstIndex(where: { $0.id == id }) else { throw ReviewError.invalid("Choose a review in Trash.") }
        var copy = self
        var review = copy.trash.remove(at: index); review.deletedAt = nil; review.localEdited = true
        copy.reviews.append(review); self = try copy.validated()
    }
    public static var example: AccountArchive {
        AccountArchive(reviews: [Review(month: "2026-11", currency: "USD", target: 50, rows: [
            Client(client: "Northline Studio", fee: 3200, hours: 34, rate: 45, other: 80),
            Client(client: "Fieldwork Coffee", fee: 1800, hours: 36, rate: 45, other: 60),
            Client(client: "Common Ground", fee: 2600, hours: 22, rate: 45, other: 110),
            Client(client: "Good Things Co.", fee: 1400, hours: 19, rate: 45, other: 45)
        ], localEdited: true)])
    }
}
