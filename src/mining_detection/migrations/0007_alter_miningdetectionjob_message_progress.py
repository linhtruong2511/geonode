from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("mining_detection", "0006_miningdetectionjob_message_progress_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="miningdetectionjob",
            name="message_progress",
            field=models.CharField(blank=True, default="", max_length=255, null=True),
        ),
    ]
