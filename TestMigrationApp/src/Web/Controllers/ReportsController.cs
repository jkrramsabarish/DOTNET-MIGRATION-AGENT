using Microsoft.AspNetCore.Mvc;
using Infrastructure.Services;

namespace Web.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ReportsController : ControllerBase
    {
        private readonly ReportArchiveService _archiveService;

        public ReportsController(ReportArchiveService archiveService)
        {
            _archiveService = archiveService;
        }

        [HttpGet("{id}")]
        public IActionResult GetReport(int id)
        {
            var report = _archiveService.LoadArchivedReport(id);
            return Ok(report);
        }

        [HttpPost("cancel-running-job")]
        public IActionResult CancelRunningJob()
        {
            _archiveService.CancelBackgroundArchiving();
            return Ok();
        }
    }
}
