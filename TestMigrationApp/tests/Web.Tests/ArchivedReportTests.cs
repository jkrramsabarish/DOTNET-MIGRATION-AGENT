using System;
using Infrastructure.Services;
using Xunit;

namespace Web.Tests
{
    public class ArchivedReportTests
    {
        [Fact]
        public void ArchivedReport_DefaultConstructor_SetsNoTitle()
        {
            var report = new ArchivedReport();
            Assert.Null(report.Title);
        }

        [Fact]
        public void ArchivedReport_CanSetProperties()
        {
            var report = new ArchivedReport
            {
                Id = 1,
                Title = "Q1 Report",
                CreatedAt = new DateTime(2026, 1, 1)
            };

            Assert.Equal(1, report.Id);
            Assert.Equal("Q1 Report", report.Title);
        }
    }
}
