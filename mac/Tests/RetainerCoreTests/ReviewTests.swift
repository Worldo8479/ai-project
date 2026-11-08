import XCTest
@testable import RetainerCore

final class ReviewTests: XCTestCase {
    private func fixture(_ name: String) throws -> Data {
        try Data(contentsOf: XCTUnwrap(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures")))
    }
    func testCalculationsMatchWebFixtures() throws {
        struct Expected: Decodable { var cost, profit, targetFee, gap: Double; var margin, hourBudget: Double? }
        struct Case: Decodable { var row: Client; var target: Int; var expected: Expected }
        let cases = try JSONDecoder().decode([Case].self, from: fixture("calculations"))
        XCTAssertEqual(cases.count, 7)
        for item in cases {
            let actual = try item.row.calculate(target: item.target)
            XCTAssertEqual(actual.cost, item.expected.cost, accuracy: 0.000001)
            XCTAssertEqual(actual.profit, item.expected.profit, accuracy: 0.000001)
            XCTAssertEqual(actual.targetFee, item.expected.targetFee, accuracy: 0.000001)
            XCTAssertEqual(actual.gap, item.expected.gap, accuracy: 0.000001)
            XCTAssertEqual(actual.margin, item.expected.margin)
            XCTAssertEqual(actual.hourBudget, item.expected.hourBudget)
        }
    }
    func testWebArchiveRoundTripPreservesConflictMetadata() throws {
        let original = try AccountArchive.decode(fixture("account"))
        let result = try AccountArchive.decode(original.encoded())
        XCTAssertEqual(original, result)
        XCTAssertEqual(result.reviews[0].revision, "fictional-fixture-revision")
        XCTAssertNil(result.reviews[0].localEdited)
    }
    func testPortfolioUsesWeightedMargin() throws {
        let review = try AccountArchive.decode(fixture("account")).reviews[0]
        let totals = try review.totals()
        XCTAssertEqual(totals.fee, 9000)
        XCTAssertEqual(totals.profit, 3710)
        XCTAssertEqual(try XCTUnwrap(totals.margin), 3710 / 9000 * 100, accuracy: 0.000001)
    }
    func testLocalEditRetainsServerRevisionAndMarksLocalChanges() throws {
        var archive = try AccountArchive.decode(fixture("account"))
        var review = archive.reviews[0]
        review.rows[1].fee = 3360
        try archive.replace(review, originalID: review.id)
        XCTAssertEqual(try archive.reviews[0].rows[1].calculate(target: 50).margin, 50)
        XCTAssertEqual(archive.reviews[0].revision, "fictional-fixture-revision")
        XCTAssertEqual(archive.reviews[0].localEdited, true)
    }
    func testTrashAndRestoreAreReversibleAndPersisted() throws {
        var archive = try AccountArchive.decode(fixture("account"))
        let original = archive.reviews[0]
        try archive.moveToTrash(id: original.id)
        archive = try AccountArchive.decode(archive.encoded())
        XCTAssertTrue(archive.reviews.isEmpty)
        XCTAssertNotNil(archive.trash[0].deletedAt)
        try archive.restore(id: original.id)
        XCTAssertTrue(archive.trash.isEmpty)
        XCTAssertEqual(archive.reviews[0].rows, original.rows)
        XCTAssertEqual(archive.reviews[0].revision, original.revision)
    }
    func testInvalidEditDoesNotMutateDocument() throws {
        var archive = AccountArchive.example
        let original = archive
        var invalid = archive.reviews[0]
        invalid.rows[1].client = " northline studio "
        XCTAssertThrowsError(try archive.replace(invalid, originalID: invalid.id))
        XCTAssertEqual(archive, original)
        invalid = archive.reviews[0]; invalid.rows[0].fee = -1
        XCTAssertThrowsError(try archive.replace(invalid, originalID: invalid.id))
        XCTAssertEqual(archive, original)
    }
    func testDuplicateMonthsIncludingTrashCannotOverwrite() throws {
        var archive = AccountArchive.example
        let review = archive.reviews[0]
        XCTAssertThrowsError(try archive.replace(review))
        try archive.moveToTrash(id: review.id)
        XCTAssertThrowsError(try archive.replace(review))
        XCTAssertEqual(archive.trash.count, 1)
    }
    func testInvalidFormatAmountsAndMetadataAreRejected() throws {
        var archive = AccountArchive.example
        archive.format = "other-export"
        XCTAssertThrowsError(try archive.encoded())
        var review = AccountArchive.example.reviews[0]
        review.month = "2026-13"; XCTAssertThrowsError(try review.validated())
        review.month = "2026-11"; review.currency = "XYZ"; XCTAssertThrowsError(try review.validated())
        review.currency = "USD"; review.target = 100; XCTAssertThrowsError(try review.validated())
        review.target = 50; review.rows[0].fee = .infinity; XCTAssertThrowsError(try review.validated())
        archive = AccountArchive.example; archive.reviews[0].deletedAt = "2026-11-08"
        XCTAssertThrowsError(try archive.validated())
    }
}
