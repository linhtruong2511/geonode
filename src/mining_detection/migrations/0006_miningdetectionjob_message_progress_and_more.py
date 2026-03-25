from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("mining_detection", "0005_miningdetectionjob_result_execution_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="miningdetectionjob",
            name="message_progress",
            field=models.CharField(default="", max_length=255),
        ),
        migrations.AddField(
            model_name="miningdetectionjob",
            name="progress_percentage",
            field=models.IntegerField(default=0),
        ),
    ]
