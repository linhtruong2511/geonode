from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("mining_detection", "0004_alter_miningdetectionjob_shapefile_url"),
    ]

    operations = [
        migrations.AddField(
            model_name="miningdetectionjob",
            name="result_execution_id",
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
    ]
